const connection = require('../classes/Connection')
const config = require('../config')
const dynamodbDocClient = require('../utils/database')

const updateBalances = () => {
    connection.connect().then(() => {
        console.log('Updating balances')

        const scanParams = {
            TableName: `${config.env}.users_wallets`,
            FilterExpression: "attribute_exists(etherWallet)",
        }

        const onScan = (err, data) => {
            if (err) {
                console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
            } else {
                data.Items.forEach(function (user) {
                    console.log(`Updating balance of ${user.etherWallet} wallet for user ${user.userId}`)

                    try {

                        connection.bc.TieToken.balanceOf(user.etherWallet).then((balance) => {
                            dynamodbDocClient.updateItem({
                                'TableName': `${config.env}.users_wallets`,
                                'Key': {
                                    'userId': user.userId,
                                },
                                ExpressionAttributeValues: {
                                    ':b': balance.toNumber()
                                },
                                UpdateExpression: 'SET balance = :b',
                            }, function (err, data) {
                                if (err) {
                                    console.log(err)
                                }
                            })
                        }).catch((err) => console.log(`error updating balance of ${user.etherWallet} wallet for user ${user.userId} ${err}`))
                    } catch (err) {
                        console.log(`error updating balance of ${user.etherWallet} wallet for user ${user.userId} ${err}`)
                    }
                });

                // continue scanning if we have more users, because
                // scan can retrieve a maximum of 1MB of data
                if (typeof data.LastEvaluatedKey != "undefined") {
                    console.log("Scanning for more...");
                    scanParams.ExclusiveStartKey = data.LastEvaluatedKey;
                    dynamodbDocClient.scan(scanParams, onScan);
                }
            }
        }

        dynamodbDocClient.scan(scanParams, onScan);
    })
}

module.exports = updateBalances
