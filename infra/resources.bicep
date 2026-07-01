// SemanticGuard AI — resource-group-scoped resources.
@description('Primary location for all resources.')
param location string
param resourceToken string
param tags object
param postgresAdminLogin string
@secure()
param postgresAdminPassword string
@secure()
param appSecretKey string
@secure()
param jwtSecretKey string
@secure()
param sendgridApiKey string
@secure()
param mailPassword string
@secure()
param atApiKey string
param proctoringSmsRecipient string

var databaseName = 'semanticguard'
var webAppName = 'azweb${resourceToken}'
var apiAppName = 'azapi${resourceToken}'
var workerAppName = 'azwrk${resourceToken}'

// Built-in role definition IDs.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var kvSecretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
var blobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// ─── User-assigned managed identity (shared by all container apps) ────────────
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'azid${resourceToken}'
  location: location
  tags: tags
}

// ─── Observability: Log Analytics + Application Insights ──────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'azlog${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'azai${resourceToken}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ─── Azure Container Registry ─────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'azcr${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

// AcrPull for the managed identity (defined before the container apps).
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── Key Vault (RBAC) ─────────────────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'azkv${resourceToken}'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    publicNetworkAccess: 'Enabled'
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
  }
}

resource kvSecretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, uami.id, kvSecretsOfficerRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsOfficerRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource secretAppKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SECRET-KEY'
  properties: { value: appSecretKey }
}
resource secretJwtKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'JWT-SECRET-KEY'
  properties: { value: jwtSecretKey }
}
resource secretSendgrid 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SENDGRID-API-KEY'
  properties: { value: empty(sendgridApiKey) ? 'unset' : sendgridApiKey }
}
resource secretMail 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'MAIL-PASSWORD'
  properties: { value: empty(mailPassword) ? 'unset' : mailPassword }
}
resource secretAtKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AT-API-KEY'
  properties: { value: empty(atApiKey) ? 'unset' : atApiKey }
}

// ─── Storage account (Blob) — managed-identity access, no shared keys ─────────
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'azst${resourceToken}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource evidenceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'evidence'
  properties: { publicAccess: 'None' }
}

resource blobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, uami.id, blobDataContributorRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributorRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── PostgreSQL Flexible Server ───────────────────────────────────────────────
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'azpg${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '17'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 14, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    authConfig: { passwordAuth: 'Enabled', activeDirectoryAuth: 'Disabled' }
  }
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Allow other Azure services (Container Apps) to reach the database.
resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

// ─── Redis (Socket.IO message queue + Celery broker) ──────────────────────────
resource redis 'Microsoft.Cache/redis@2024-03-01' = {
  name: 'azrd${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'Basic', family: 'C', capacity: 0 }
    minimumTlsVersion: '1.2'
    enableNonSslPort: false
  }
}

// ─── Azure Web PubSub ─────────────────────────────────────────────────────────
resource webPubSub 'Microsoft.SignalRService/webPubSub@2024-03-01' = {
  name: 'azwps${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'Free_F1', tier: 'Free', capacity: 1 }
}

// ─── Container Apps environment ───────────────────────────────────────────────
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'azcae${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ─── Connection strings / secrets shared by the api + worker apps ─────────────
var databaseUrl = 'postgresql+psycopg2://${postgresAdminLogin}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'
var redisUrl = 'rediss://:${redis.listKeys().primaryKey}@${redis.properties.hostName}:6380/0'
var webPubSubConn = webPubSub.listKeys().primaryConnectionString

var appSecrets = [
  { name: 'database-url', value: databaseUrl }
  { name: 'redis-url', value: redisUrl }
  { name: 'webpubsub-conn', value: webPubSubConn }
  { name: 'appinsights-conn', value: appInsights.properties.ConnectionString }
  { name: 'secret-key', value: appSecretKey }
  { name: 'jwt-secret', value: jwtSecretKey }
  { name: 'sendgrid-key', value: empty(sendgridApiKey) ? 'unset' : sendgridApiKey }
  { name: 'mail-password', value: empty(mailPassword) ? 'unset' : mailPassword }
  { name: 'at-api-key', value: empty(atApiKey) ? 'unset' : atApiKey }
]

var appEnv = [
  { name: 'FLASK_ENV', value: 'production' }
  { name: 'PORT', value: '5000' }
  { name: 'SOCKETIO_ASYNC_MODE', value: 'eventlet' }
  { name: 'SOCKETIO_MESSAGE_QUEUE', secretRef: 'redis-url' }
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'REDIS_URL', secretRef: 'redis-url' }
  { name: 'CELERY_BROKER_URL', secretRef: 'redis-url' }
  { name: 'CELERY_RESULT_BACKEND', secretRef: 'redis-url' }
  { name: 'CACHE_REDIS_URL', secretRef: 'redis-url' }
  { name: 'STORAGE_PROVIDER', value: 'azure' }
  { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
  { name: 'AZURE_STORAGE_CONTAINER', value: 'evidence' }
  { name: 'AZURE_WEBPUBSUB_CONNECTION_STRING', secretRef: 'webpubsub-conn' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-conn' }
  { name: 'AZURE_KEY_VAULT_URI', value: keyVault.properties.vaultUri }
  { name: 'AZURE_CLIENT_ID', value: uami.properties.clientId }
  { name: 'SECRET_KEY', secretRef: 'secret-key' }
  { name: 'JWT_SECRET_KEY', secretRef: 'jwt-secret' }
  { name: 'SENDGRID_API_KEY', secretRef: 'sendgrid-key' }
  { name: 'MAIL_PASSWORD', secretRef: 'mail-password' }
  { name: 'AT_API_KEY', secretRef: 'at-api-key' }
  { name: 'MFA_SMS_ENABLED', value: 'true' }
  { name: 'PROCTORING_SMS_ALERT_ENABLED', value: 'true' }
  { name: 'PROCTORING_SMS_RECIPIENT', value: proctoringSmsRecipient }
  { name: 'FRONTEND_ORIGIN', value: 'https://${webAppName}.${containerEnv.properties.defaultDomain}' }
]

var corsPolicy = {
  allowedOrigins: ['*']
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  allowedHeaders: ['*']
}

var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// ─── Web (nginx SPA + reverse proxy) — external ingress ───────────────────────
resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: webAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        corsPolicy: corsPolicy
      }
      registries: [ { server: acr.properties.loginServer, identity: uami.id } ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: placeholderImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [ { name: 'BACKEND_URL', value: 'http://${apiAppName}' } ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull ]
}

// ─── API (Flask + Socket.IO) — internal ingress, sticky sessions ──────────────
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'api' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 5000
        transport: 'auto'
        allowInsecure: false
        stickySessions: { affinity: 'sticky' }
        corsPolicy: corsPolicy
      }
      registries: [ { server: acr.properties.loginServer, identity: uami.id } ]
      secrets: appSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: placeholderImage
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: appEnv
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull, kvSecretsOfficer, blobDataContributor, secretAppKey, secretJwtKey ]
}

// ─── Worker (Celery AI pipeline) — no ingress ─────────────────────────────────
resource workerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: workerAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'worker' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [ { server: acr.properties.loginServer, identity: uami.id } ]
      secrets: appSecrets
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: placeholderImage
          resources: { cpu: json('2.0'), memory: '4Gi' }
          env: concat(appEnv, [ { name: 'RUN_MIGRATIONS', value: '0' } ])
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull, kvSecretsOfficer, blobDataContributor, secretAppKey, secretJwtKey ]
}

// ─── Outputs ──────────────────────────────────────────────────────────────────
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.properties.loginServer
output AZURE_KEY_VAULT_ENDPOINT string = keyVault.properties.vaultUri
output WEB_URI string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output API_URI string = 'https://${apiAppName}.${containerEnv.properties.defaultDomain}'
