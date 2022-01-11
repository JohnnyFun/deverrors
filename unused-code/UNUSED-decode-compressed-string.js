// var zlib = require('zlib')
// var input = 'Hellow world'

// var deflated = zlib.deflateSync(input).toString('base64')
// var inflated = zlib.inflateSync(new Buffer(deflated, 'base64')).toString()

// console.log(inflated)

const zlib = require('zlib')
console.log(buildAppInsightsQueryLink("requests | where user_Id == 'bVzgf8F6SqjftHZ1GeKo3c' | project customDimensions.CN_Username"))

// let encoded = 'H4sIAAAAAAAAA0utSE4tKMnMzyvmqlHIL0pJLVJIqlQoycxNLS5JzC1QSEktTgbK5GTmZpYomBpwAQC9mKnUMAAAAA%253D%253D'
// encoded = decodeURIComponent(encoded)
// encoded = atob(encoded)
// const deflated = zlib.inflateSync(Buffer.from(encoded, 'base64'))
// console.log(deflated)

function buildAppInsightsQueryLink(query) {
  let encoded = zlib.deflateSync(query).toString('base64')
  encoded = encodeURIComponent(encoded)
  return `https://portal.azure.com/#blade/Microsoft_Azure_Monitoring_Logs/LogsBlade/resourceId/%2Fsubscriptions%2F0d1b6026-7597-4672-a5fd-f1bd1553bdc2%2FresourceGroups%2FClinicianNexus%2Fproviders%2Fmicrosoft.insights%2Fcomponents%2FCNProdInsights/source/LogsBlade.AnalyticsShareLinkToQuery/q/${encoded}/timespan/P1D`
}
