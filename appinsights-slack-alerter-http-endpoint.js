// NOTE: DO NOT MODIFY THIS CODE DIRECTLY FROM AZURE. INSTEAD MODIFY THE REPO AND THEN COPY THE CODE TO AZURE
const nodeFetch = (...args) => import('node-fetch').then(f => f.default(...args)) // since nodejs doesn't support esm import natively
const zlib = require('zlib')

const limitErrorCount = 10
const slackChannel = 'deverrors'
const prodEnvName = 'Prod/stage'
let _context

module.exports = async function (context, req) {
  _context = context
  // context.log(req)
  _context.log('Hitting at ' + new Date().toISOString())
  const expectedErrorCount = req.body.data.alertContext.condition.allOf[0].metricValue
  _context.log(`${expectedErrorCount} error${expectedErrorCount === 1 ? '' : 's'} expected`)
  if (expectedErrorCount > 0) {
    let windowStartTime = req.body.data.alertContext.condition.windowStartTime
    _context.log('windowStartTime: ' + windowStartTime)
    // // if we find that windowstart time misses errors that don't get into app insights quick enough and the next run doesn't include them either, we could just subtract some time and deal with the occassional duplicate error I guess. But haven't confirmed if this happens yet.
    // const windowStartTimeParsed = new Date(windowStartTime)
    // windowStartTimeParsed.setMinutes(windowStartTimeParsed.getMinutes() - 5) // if we find that windowstart
    // windowStartTime = windowStartTimeParsed.toISOString()

    // windowEndTime doesn't go out far enough it seems, so we'll just get all errors since window startTime I guess...concerning though...
    const windowEndTime = req.body.data.alertContext.condition.windowEndTime // not used other than to log what the value is...
    _context.log('windowEndTime: ' + windowEndTime)

    const alertTargetIDs = req.body.data.essentials.alertTargetIDs
    const isProd = alertTargetIDs.some(t => t.toLowerCase().includes('prod'))
    const env = isProd
      ? {
          name: prodEnvName,
          url: 'https://app.cliniciannexus.com',
          azureAppInsightsApplicationId: 'fa81777b-99c2-41a6-90fc-3e77a73b8470',
          azureAppInsightsApiKey: process.env.PROD_APPINSIGHTS_API_KEY,
        }
      : {
          name: 'Demo',
          url: 'https://demo.cliniciannexus.com',
          azureAppInsightsApplicationId: '5702ec58-bf37-44be-8ae7-83b019ac1dac',
          azureAppInsightsApiKey: process.env.DEMO_APPINSIGHTS_API_KEY,
        }
    await alertDevErrorsIfNecessary(expectedErrorCount, env, windowStartTime)
  }
  _context.res = {
    // status: 200, /* Defaults to 200 */
    // body: responseMessage
  }
}

async function alertDevErrorsIfNecessary(expectedErrorCount, env, windowStartTime) {
  try {
    log(`${env.name}: Looking for errors since ${windowStartTime}`)
    const errors = await tryGetAppInsightsErrorsSince(expectedErrorCount, env, windowStartTime)
    log(`${env.name}: Found ${errors.length} errors`)
    if (errors.length === 0) return
    const filteredErrors = filterAppInsightsWeCareAbout(errors)
    log(`${env.name}: Found ${filteredErrors.length} errors we care about`)
    if (filteredErrors.length === 0) return
    const message = getSlackMessageFromErrors(env, filteredErrors)
    await postToSlack(message)
  } catch (e) {
    log(e)
    await postToSlack(`Error checking for errors: ${e.message}`)
  }
}

async function tryGetAppInsightsErrorsSince(expectedErrorCount, env, windowStartTime) {
  // sometimes the first call to getAppInsightsErrorsSince doesn't return all the expected errors, so we'll try a few times before just going with what we get
  const attempts = 5
  const waitBetweenAttempts = 1000
  let attempt = 0
  let errors = []
  while (attempt < attempts) {
    errors = await getAppInsightsErrorsSince(env, windowStartTime)
    if (expectedErrorCount <= errors.length) {
      return errors
    } else {
      attempt++
      await waitAsync(waitBetweenAttempts)
    }
  }
  await postToSlack(`${env.name}: Expected ${expectedErrorCount} errors, but only found ${errors.length}`)
  return errors
}

function filterAppInsightsWeCareAbout(errors) {
  return errors.filter(error => {
    // chrome extension errors should usually not affect our app's code. And we can't really do anything til a particular person actually complains about something not working and then we can look up errors from them to find these and suggest they disable chrome extensions to see if it resolves the issue
    if (error.assembly?.startsWith('chrome-extension:')) return false

    // recaptcha throws this error, but it doesn't seem to be a problem
    if (
      error.assembly?.startsWith('https://www.gstatic.com/recaptcha') &&
      (error.type?.includes(`Cannot read properties of null (reading 'style')`) || error.type?.includes(`Cannot read property 'style' of null`))
    )
      return false

    /* this comes from map-box
        unminified goes to a minified file...could unminify it and dig deeper, but meh
        {
          "source": "webpack:///node_modules/mapbox-gl/dist/mapbox-gl.js",
          "line": 31,
          "column": 391568,
          "name": null
        }
    */
    if (error.type === 'TypeError: undefined is not an object (evaluating \'t[12]\')') return false

    // https://blog.sentry.io/2016/05/17/what-is-script-error
    // errors that came from a different origin (intercom, recaptcha, etc) and don't have crossorigin attribute and Access-Control-Allow-Origin set
    // ideally, we'd wrap in try/catch like the article says, so we can see what the underlying error is, but don't care right now and don't want these to be annoying
    if (error.type === 'ErrorEvent: Script error.') return false

    // comes from tribute.js when you click on the scrollbar of the dropdown
    // does not affect end user experience
    // documented here: https://github.com/zurb/tribute/issues/215
    // couldn't find the error message in the src code, but also doesn't seem like it's a common error, so we'll just ignore it
    // could also pull fork it and fix it, but meh
    if (error.type === 'Uncaught Error: cannot find the <li> container for the click at value') return false
    
    // add more here if you want to filter out more errors...

    return true
  })
}

function getSlackMessageFromErrors(env, filteredErrors) {
  // useful reference: https://api.slack.com/methods/chat.postMessage
  filteredErrors = filteredErrors.reverse() // so latest message is last in slack...
  const messages = filteredErrors.map(error => {
    const customDimensions = error.customDimensions ? JSON.parse(error.customDimensions) : {}
    const user = customDimensions.CN_Username
      ? `<${env.url}/user/${customDimensions.CN_Username}|${customDimensions.CN_Username}>`
      : error.user_Id !== ''
      ? buildAppInsightsQueryLink(env, error.user_Id, `requests | where user_Id == '${error.user_Id}' | project customDimensions.CN_Username`)
      : null
    const isCX = customDimensions.CN_IsCX === 'Yes'
    const errorDetails = []
    errorDetails.push(`_${error.timestamp}_`)
    if (!error.problemId.includes(error.outerMessage)) errorDetails.push(`outerMessage: ${error.outerMessage}`)
    if (error.innermostMessage !== '' && error.innermostMessage !== error.outerMessage)
      errorDetails.push(`innermostMessage: ${error.innermostMessage}`)
    if (user !== null) {
      errorDetails.push(`user: ${user}${isCX ? ' (impersonating)' : ''}`)
    }
    if (error.operation_Name && error.operation_Name !== '/') {
      errorDetails.push(`operation_Name: ${error.operation_Name.startsWith('/') ? env.url : ''}${error.operation_Name}`)
    }
    if (!error.assembly.includes('app.cliniciannexus.com')) errorDetails.push(`assembly: ${error.assembly}`)
    const errorQuery = `exceptions | where timestamp == todatetime('${error.timestamp}')`
    const errorTitle = buildAppInsightsQueryLink(env, `*${error.problemId}*`, errorQuery)
    const detailDelimiter = '\n          '
    return `    🪲 ${errorTitle}${detailDelimiter}${errorDetails.join(detailDelimiter)}`
  })
  const messageTitleText = `⚠️ ${filteredErrors.length}${filteredErrors.length > limitErrorCount ? '+' : ''} ${env.name} exception${
    filteredErrors.length === 1 ? '' : 's'
  } in the last 5 minutes`
  const messageTitle = buildAppInsightsQueryLink(env, messageTitleText, 'exceptions | order by timestamp desc | limit 50')
  const message = `*${messageTitle}*\n\n${messages.join('\n\n')}`
  return message
}

function waitAsync(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getAppInsightsErrorsSince(env, windowStartTime) {
  // docs: https://dev.applicationinsights.io/documentation/Using-the-API/Query
  const rawData = await httpPost(
    `https://api.applicationinsights.io/v1/apps/${env.azureAppInsightsApplicationId}/query?timespan=P1D`,
    {
      'x-api-key': env.azureAppInsightsApiKey,
    },
    {
      query: `
        exceptions
        | where timestamp >= todatetime('${windowStartTime}')
        | order by timestamp desc
        | limit ${limitErrorCount + 1}
      `,
      options: {
        truncationMaxSize: 67108864,
      },
      maxRows: 30001,
      workspaceFilters: {
        regions: [],
      },
    }
  )
  const columns = rawData.tables[0].columns
  const errors = rawData.tables[0].rows.map(row => {
    return columns.reduce((obj, column, index) => {
      obj[column.name] = row[index]
      return obj
    }, {})
  })
  return errors
}

function buildAppInsightsQueryLink(env, text, query) {
  text = text.replace(/[<>|]/g, '') // remove special link syntax characters from link text
  let encoded = zlib.deflateSync(query).toString('base64')
  encoded = encodeURIComponent(encoded)
  const envName = env.name
  const isProd = envName === prodEnvName
  const appName = isProd ? 'ClinicianNexus' : 'cliniciannexusdemo'
  const appInsightsName = isProd ? 'CNProdInsights' : 'CNDemoInsights'
  return `<https://portal.azure.com/#blade/Microsoft_Azure_Monitoring_Logs/LogsBlade/resourceId/%2Fsubscriptions%2F0d1b6026-7597-4672-a5fd-f1bd1553bdc2%2FresourceGroups%2F${appName}%2Fproviders%2Fmicrosoft.insights%2Fcomponents%2F${appInsightsName}/source/LogsBlade.AnalyticsShareLinkToQuery/q/${encoded}/timespan/P1D|${text}>`
}

function postToSlack(message) {
  //log(message)
  // docs: https://api.slack.com/methods/chat.postMessage
  return httpPost(
    `https://slack.com/api/chat.postMessage`,
    {
      Authorization: `Bearer ${process.env.SLACK_ACCESS_TOKEN}`,
    },
    {
      channel: slackChannel,
      text: message,
    }
  ).then(res => {
    if (!res.ok) throw new Error(`Slack failed: ${res.error}`)
    return res
  })
}

function httpPost(uri, headers, body) {
  return nodeFetch(uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  }).then(async res => {
    const json = await res.json()
    if (!res.ok) throw new Error(`HTTP failed for ${uri}: ${res.status} ${res.statusText}: ${JSON.stringify(json, null, 2)}`)
    return json
  })
}

function log(message) {
  _context.log(message)
}
