// NOTE: ended up making an http endpoint instead of a cron timer job
const nodeFetch = (...args) => import('node-fetch').then(f => f.default(...args)) // since nodejs doesn't support esm import natively
const zlib = require('zlib')

const limitErrorCount = 10
const slackAccessToken = process.env.SLACK_ACCESS_TOKEN
const slackChannel = 'deverrors'
const prodEnvName = 'Prod/stage'
const azureAppInsightsEnvironmentsToCheck = [
  {
    name: prodEnvName,
    url: 'https://app.cliniciannexus.com',
    azureAppInsightsApplicationId: 'fa81777b-99c2-41a6-90fc-3e77a73b8470',
    azureAppInsightsApiKey: process.env.PROD_APPINSIGHTS_API_KEY,
  },
  {
    name: 'Demo',
    url: 'https://demo.cliniciannexus.com',
    azureAppInsightsApplicationId: '5702ec58-bf37-44be-8ae7-83b019ac1dac',
    azureAppInsightsApiKey: process.env.DEMO_APPINSIGHTS_API_KEY,
  },
]

let _context
let _myTimer

module.exports = async function (context, myTimer) {
  _context = context
  _myTimer = myTimer
  await main()
}

async function runLocally() {
  _context = console
  _myTimer = { scheduleStatus: { last: '2021-12-23T04:55:00.0009306+00:00' } }
  await main()
}
// runLocally() // BE SURE THIS IS COMMENTED OUT IN PRODUCTION

async function main() {
  for (const env of azureAppInsightsEnvironmentsToCheck) await alertDevErrorsIfNecessary(env)
}
// IF RE-USE THIS, GET UPDATED FUNCTIONS FROM THE CURRENT CODE...
