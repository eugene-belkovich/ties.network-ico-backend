const dynamodbDocClient = require('../utils/database')
const connection = require('../classes/Connection')
const config = require('../config')

processBtcTransactions = async () => {
    const scanParams = {
        TableName: `${config.env}.btc_transactions`,
        FilterExpression: `confirmations>=:confirmations AND #status = :unprocessed`,
        ExpressionAttributeNames: {
            "#status": "status"
        },
        ExpressionAttributeValues: {
            ":confirmations": 3,
            ":unprocessed": "unprocessed"
        },
    }

    const onScan = async (err, data) => {
        if (err) {
            console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
        } else {
            console.log("Query succeeded.");

            for (let transaction of data.Items) {
                await processTransaction(transaction)
                console.log(`Processed transaction ${transaction.txid} ${transaction.n}`)
            }

            // continue scanning if we have more users, because
            // scan can retrieve a maximum of 1MB of data
            if (typeof data.LastEvaluatedKey != "undefined") {
                scanParams.ExclusiveStartKey = data.LastEvaluatedKey;
                dynamodbDocClient.scan(scanParams, onScan);
            } else {
                console.log(`Completed bitcoin transactions processing, rescheduling`)
                setTimeout(processBtcTransactions, config.timeout)
            }
        }
    }

    await connection.connect()

    connection.bc.web3.eth.defaultAccount = config.blockchain.signer_address

    const isOpen = await connection.bc.TokenSale.isOpen();
    if (!isOpen) {
        console.log(`Skipping execution because contract is closed`)
        setTimeout(processBtcTransactions, config.timeout)
        return
    }

    dynamodbDocClient.scan(scanParams, onScan);
}

processTransaction = async (transaction) => {
    console.log(`Processing transaction ${transaction.txid} ${transaction.n}`)

    await dynamodbDocClient.updateItem({
        'TableName': `${config.env}.btc_transactions`,
        'Key': {
            'txid': transaction.txid,
            'n': transaction.n,
        },
        UpdateExpression: 'SET #status = :processed',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':processed': 'processing',
        }
    }).promise()

    try {

        const settingsData = await dynamodbDocClient.getItem({
            'TableName': `${config.env}.settings`,
            'Key': {
                'key': 'key'
            }
        }).promise()

        const userData = await dynamodbDocClient.getItem({
            TableName: `${config.env}.users_wallets`,
            Key: {
                "userId": transaction.sendTo
            }
        }).promise()

        const user = userData.Item

        const settings = settingsData.Item

        const ethAmount = transaction.amount * settings.btcRate / settings.ethRate

        console.log(`Sending ${transaction.amount} * ${settings.btcRate} / ${settings.ethRate} = ${ethAmount} to user ${user.userId} with address ${user.etherWallet}`)

        return connection.bc.TokenSale.buyAlt(user.etherWallet, connection.bc.web3.toWei(ethAmount, 'ether'), transaction.txid).then(async (transactionResult) => {
            console.dir(transactionResult)

            return dynamodbDocClient.updateItem({
                'TableName': `${config.env}.btc_transactions`,
                'Key': {
                    'txid': transaction.txid,
                    'n': transaction.n,
                },
                UpdateExpression: 'SET #status = :processed, txHash = :txHash',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':processed': 'processed',
                    ':txHash': transactionResult.tx
                }
            }).promise()
        }).catch(async (err) => {
            console.log(err)
            await markAsFailed(transaction)
        })
    } catch (err) {
        console.log(err)
        await markAsFailed(transaction)
    }

}

markAsFailed = async (transaction) => {
    return dynamodbDocClient.updateItem({
        'TableName': `${config.env}.btc_transactions`,
        'Key': {
            'txid': transaction.txid,
            'n': transaction.n,
        },
        UpdateExpression: 'SET #status = :processed',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':processed': 'failed',
        }
    }).promise()
}

module.exports = processBtcTransactions