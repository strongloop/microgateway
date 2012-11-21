// app config properties

// HTTP server
exports.http = {
    host: 'localhost',
    port: '3002'
}

// mongodb connection
exports.creds = {
  mongo: {
    'hostname': 'localhost',
    'port': 27017,
    'username': '',
    'password': '',
    'name': '',
    'db': 'node-api-gateway_development'
  }
}

// CORS allowed domains
exports.cors = {
  allowedDomains: '*'
}
