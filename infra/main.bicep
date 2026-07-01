// SemanticGuard AI — Azure infrastructure (Container Apps stack)
// Provisions the full production environment: Container Apps (web/api/worker),
// PostgreSQL Flexible Server, Redis, Blob Storage, Key Vault, Web PubSub,
// Application Insights + Log Analytics, and Azure Container Registry.
targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment — used to derive resource names.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'sgadmin'

@secure()
@description('PostgreSQL administrator password.')
param postgresAdminPassword string

@secure()
@description('Flask SECRET_KEY (auto-generated if not supplied).')
param appSecretKey string = newGuid()

@secure()
@description('Flask JWT secret (auto-generated if not supplied).')
param jwtSecretKey string = newGuid()

// Optional application secrets (email / SMS). Leave blank to configure later.
@secure()
param sendgridApiKey string = ''
@secure()
param mailPassword string = ''
@secure()
param atApiKey string = ''
@description('Proctoring alert SMS recipient (E.164).')
param proctoringSmsRecipient string = ''

var tags = { 'azd-env-name': environmentName }
var resourceToken = uniqueString(subscription().id, location, environmentName)

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    postgresAdminLogin: postgresAdminLogin
    postgresAdminPassword: postgresAdminPassword
    appSecretKey: appSecretKey
    jwtSecretKey: jwtSecretKey
    sendgridApiKey: sendgridApiKey
    mailPassword: mailPassword
    atApiKey: atApiKey
    proctoringSmsRecipient: proctoringSmsRecipient
  }
}

output RESOURCE_GROUP_ID string = rg.id
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.AZURE_CONTAINER_REGISTRY_ENDPOINT
output AZURE_KEY_VAULT_ENDPOINT string = resources.outputs.AZURE_KEY_VAULT_ENDPOINT
output WEB_URI string = resources.outputs.WEB_URI
output API_URI string = resources.outputs.API_URI
