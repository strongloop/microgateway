var fs = require('fs');
var express = require('express');
var https = require('https');
var bodyParser = require('body-parser');
var multer = require('multer'); 
var Crypto = require('crypto');
var upload = multer();
var key = fs.readFileSync(__dirname + '/key.pem');
var cert = fs.readFileSync(__dirname + '/cert.pem')
var public_key = fs.readFileSync('./id_rsa.pub','utf8');
var https_options = {
    key: key,
    cert: cert
};
var PORT = 5555;
var HOST = 'localhost';
var app = express();

exports.start = function (HOST, PORT, cb) {
    var server = https.createServer(https_options, app).listen(PORT, HOST);
    console.log('HTTPS Server listening on %s:%s', HOST, PORT);
    return server;
};



app.use(bodyParser.json()); 

app.post('/v1/*', upload.array(), function(req, res) {
    var version = req.body.gatewayVersion;
    var clientID = '1111-1111'
    // decrypt the version
    var decryptedVersion = Crypto.publicDecrypt(public_key, new Buffer(version, 'ascii')).toString();
    console.log('DecryptedBody:' + JSON.stringify(decryptedVersion));
    
    // create payload and send it
    var password = Crypto.createHash('sha256').update('Nixnogen').digest();
    var algorithm = 'AES-256-CBC';
    var IV = '0000000000000000';
    var cipher = Crypto.createCipheriv(algorithm, password, IV)
    var encryptedCipher = Crypto.publicEncrypt(public_key, new Buffer(password))
    
    var payload = {
                managerKey: key,
                managerCert: cert,
                clientID: clientID
                }
    
    console.log('payload: ' + JSON.stringify(payload));
    
    var encryptedPayload = cipher.update(JSON.stringify(payload), 'utf8', 'base64');
    encryptedPayload += cipher.final('base64');
    
    var body = {
                cipher: encryptedPayload,
                Key: encryptedCipher
                };
                
    res.status(200).json(body)
});
