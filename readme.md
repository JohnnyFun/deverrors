**To make changes and deploy:**
  - make changes to the code in [appinsights-slack-alerter-http-endpoint.js](https://github.com/JohnnyFun/deverrors/blob/main/appinsights-slack-alerter-http-endpoint.js)
  - push your changes to this repo
  - then copy in the code in [appinsights-slack-alerter-http-endpoint.js](https://github.com/JohnnyFun/deverrors/blob/main/appinsights-slack-alerter-http-endpoint.js) into azure [here](https://portal.azure.com/#blade/WebsitesExtension/FunctionMenuBlade/code/resourceId/%2Fsubscriptions%2F0d1b6026-7597-4672-a5fd-f1bd1553bdc2%2FresourceGroups%2FSlackAlerter%2Fproviders%2FMicrosoft.Web%2Fsites%2Fslack-deverrors%2Ffunctions%2FHttpTrigger1)

We could hook it up to deploy from vscode, but meh--just want to have the history/repo in a central location and we can manually copy the code up into azure. So just don't forget to change this repo if you make changes, otherwise they may get overwritten the next time someone changes it.

The http endpoint will receive a body that follows the [azure common alert schema](https://docs.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-common-schema?WT.mc_id=Portal-Microsoft_Azure_Monitoring)

Example request body:
```
{
  "schemaId": "azureMonitorCommonAlertSchema",
  "data": {
    "essentials": {
      "alertId": "/subscriptions/0d1b6026-7597-4672-a5fd-f1bd1553bdc2/providers/Microsoft.AlertsManagement/alerts/af0825ae-9feb-4ef9-8c32-b492e7acf353",
      "alertRule": "deverrors",
      "severity": "Sev3",
      "signalType": "Metric",
      "monitorCondition": "Fired",
      "monitoringService": "Platform",
      "alertTargetIDs": [
        "/subscriptions/0d1b6026-7597-4672-a5fd-f1bd1553bdc2/resourcegroups/cliniciannexus/providers/microsoft.insights/components/cnprodinsights"
      ],
      "configurationItems": ["cnprodinsights"],
      "originAlertId": "0d1b6026-7597-4672-a5fd-f1bd1553bdc2_ClinicianNexus_microsoft.insights_metricAlerts_deverrors_1482284127",
      "firedDateTime": "2022-01-06T21:05:13.6812469Z",
      "description": "",
      "essentialsVersion": "1.0",
      "alertContextVersion": "1.0"
    },
    "alertContext": {
      "properties": null,
      "conditionType": "SingleResourceMultipleMetricCriteria",
      "condition": {
        "windowSize": "PT5M",
        "allOf": [
          {
            "metricName": "exceptions/count",
            "metricNamespace": "microsoft.insights/components",
            "operator": "GreaterThan",
            "threshold": "0",
            "timeAggregation": "Count",
            "dimensions": [],
            "metricValue": 2.0,
            "webTestName": null
          }
        ],
        "windowStartTime": "2022-01-06T20:57:06.001Z",
        "windowEndTime": "2022-01-06T21:02:06.001Z"
      }
    }
  }
}
```

**TODO:**

- store CN_Username for server-side stuff too, not just client-side, so we don't have to run a `requests where...` query to determine the user's name
- group by `problemId` and show count and first error info
- make clear when from stage as opposed to prod... `const isStage = error.appName === '...'`
- consider moving the usages of isErrorBenign to here so we log ignored errors into appinsights but simply don't alert ourselves about them
- consider including stacktrace in a collapsible section/blockquote like stackify used to do for us... `const stackTrace = details.rawStack ?? customDimensions.CN_Stack`
  - similar for error "details" `const details = error.details ? JSON.parse(error.details)[0] : {}`
- unminify stacktrace if not empty
  - upload map files to the blob storage associated with the function or put the map files into the function code files
  - then use the unminify.js logic to use those files to unminify the stacktrace
  - this will make it MUCH more likely that devs will see their errors in their own svelte components and fix them asap
