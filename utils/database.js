const doc = require('dynamodb-doc')
const AWS = require('aws-sdk')

AWS.config.setPromisesDependency(Promise);

AWS.config.update({
    accessKeyId: 'AKIAI36EQQISSE5AWXYA',
    secretAccessKey: '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',
    region: 'eu-central-1'
});

var dynamodbDocClient = new doc.DynamoDB()

module.exports = dynamodbDocClient