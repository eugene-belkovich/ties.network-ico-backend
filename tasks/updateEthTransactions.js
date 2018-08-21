Web3 = require("web3");
const config = require('../config')
const dynamodbDocClient = require('../utils/database')

updateTransactions = async () => {
    console.log(`Started updating transactions`)

    var params = {
        TableName: `${config.env}.contract_data`,
        KeyConditionExpression: '#key = :key',
        Limit: 1,
        ScanIndexForward: false,    // true = ascending, false = descending
        ExpressionAttributeNames: {
            '#key': 'key'
        },
        ExpressionAttributeValues: {
            ':key': 'key'
        }
    };

    const contractData = await dynamodbDocClient.query(params).promise()

    const contractAddress = contractData.Items[0].contractAddress

    console.log(`Updating contract using address ${contractAddress}`)

    var web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.ethNodeHost}:8545`));

    const ethProcessingData = await dynamodbDocClient.getItem({
        'TableName': `${config.env}.eth_processing_data`,
        'Key': {
            'key': 'key'
        }
    }).promise()

    console.log(`Processing from block: ${ethProcessingData.Item.blockHeight}`)

    const filter = web3.eth.filter({
        fromBlock: ethProcessingData.Item.blockHeight,
        address: contractAddress,
    })

    let highestBlock = ethProcessingData.Item.blockHeight

    filter.get(async (error, results) => {
        if(error) {
            console.log(`Error filtering transaction: ${error}`)
            return results
        }

        for(let result of results) {

            console.log(`Got new eth transaction: ${result.transactionHash}`)

            if (result.transactionHash) {
                const transaction = web3.eth.getTransaction(result.transactionHash)

                if(highestBlock < transaction.blockNumber) {
                    highestBlock = transaction.blockNumber
                }

                await dynamodbDocClient.putItem({
                    'TableName': `${config.env}.eth_transactions`,
                    'Item': {
                        'hash': transaction.hash,
                        'value': transaction.value.toNumber(),
                        'from': transaction.from,
                        'blockNumber': transaction.blockNumber,
                        'timestamp': new Date().getTime(),
                    },
                }).promise()
            }
        }

        await dynamodbDocClient.updateItem({
            'TableName': `${config.env}.eth_processing_data`,
            'Key': {
                'key': 'key',
            },
            UpdateExpression: 'SET blockHeight = :blockHeight',
            ExpressionAttributeValues: {
                ':blockHeight': highestBlock - 5,
            }
        }).promise()

        console.log(`Finished updating eth transactions, rescheduling`)
        setTimeout(updateTransactions, config.timeout)
    })
}

module.exports = updateTransactions
