const btcClient = require('../utils/btcClient')
const dynamodbDocClient = require('../utils/database')
const config = require('../config')

updateTransactionConfirmations = async () => {
    const scanParams = {
        TableName: `${config.env}.btc_transactions`,
        FilterExpression: `confirmations<:confirmations AND #status = :unprocessed`,
        ExpressionAttributeNames: {
            "#status": "status"
        },
        ExpressionAttributeValues: {
            ":confirmations": 10,
            ":unprocessed": "unprocessed"
        },
    }

    const onScan = async (err, data) => {
        if (err) {
            console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
        } else {
            console.log("Query succeeded.");

            for(let transaction of data.Items) {
                await updateTransaction(transaction)
            }

            // continue scanning if we have more users, because
            // scan can retrieve a maximum of 1MB of data
            if (typeof data.LastEvaluatedKey != "undefined") {
                scanParams.ExclusiveStartKey = data.LastEvaluatedKey;
                dynamodbDocClient.scan(scanParams, onScan);
            } else {
                console.log(`Completed bitcoin cofirmations check, rescheduling`)
                setTimeout(updateTransactionConfirmations, config.timeout)
            }
        }
    }

    dynamodbDocClient.scan(scanParams, onScan);
}

updateTransaction = async (transaction) => {
    const transactionData = await btcClient.getTransaction(transaction.txid)

    await dynamodbDocClient.updateItem({
        'TableName': `${config.env}.btc_transactions`,
        'Key': {
            'txid': transaction.txid,
            'n': transaction.n
        },
        UpdateExpression: 'SET confirmations = :confirmations',
        ExpressionAttributeValues: {
            ':confirmations': transactionData.confirmations,
        }
    }).promise()

    console.log(`Updated number of confirmations for tx ${transaction.txid} ${transaction.n}`)
}

module.exports = updateTransactionConfirmations