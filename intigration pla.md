https://ef99-49-248-125-98.ngrok-free.app/api/v1/ this is base url
for getting access token and refresh token u need to call /auth/handshake an in header you need too send content-type application/json and lisensekey and this is payload
{
"orgId": "{{orgId}}"
}

and you will recive refresh token and access token from this.
store both in lesense modeule and use for next call /requests
headers
Content-Type:application/json
Authorization:Bearer {{accessToken}}
licenseKey:{{licenseKey}}

body
{
"orgId": "{{orgId}}",
"leadId": "LEAD-001",
"requestType": "LeadEnrichment",
"payload": {
"first_name": "Jon",
"last_name": "Appleton",
"email": "jon@targetco.com",
"title": "CIO",
"company_name": "TargetCo Mining"
}
}
