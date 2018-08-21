const dynamodbDocClient = require('../utils/database')
const connection = require('../classes/Connection')
const BigNumber = require('bignumber.js');
const Web3 = require("web3");
const config = require('../config')

async function updateContract(totalEthInvested, totalBtcInvested) {
    await connection.connect()
    const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.ethNodeHost}:8545`))

    const totalSupply = await connection.bc.TieToken.totalSupply()
    const currentBonus = await connection.bc.TokenSale.getCurrentBonus();
    const blockNumber = web3.eth.blockNumber
    const contractAddress = await connection.bc.TokenSale.address
    const price = await connection.bc.TokenSale.price();
    const isOpen = await connection.bc.TokenSale.isOpen();

    console.log(`Updated contract: ${totalEthInvested} ${totalSupply} ${currentBonus} ${price.toString()}`)

    dynamodbDocClient.putItem({
        'TableName': `${config.env}.contract_data`,
        'Item': {
            'key': 'key',
            'timestamp': new Date().getTime(),
            'totalEthInvested': totalEthInvested.toString(),
            'totalSupply': totalSupply.toNumber(),
            'currentBonus': currentBonus.toNumber(),
            'totalBtcInvested': totalBtcInvested.toString(),
            'blockNumber': blockNumber,
            'tokenPrice': price.toString(),
            'isOpen': isOpen,
            contractAddress
        }
    }, function (err, data) {
        if (err) {
            console.log(err)
        }
    })
}

const updateContractData = () => {
    console.log('Updating contract data')

    const scanParams = {
        TableName: `${config.env}.eth_transactions`,
    }

    let totalEthInvested = new BigNumber(0);

    const onScan = (err, data) => {
        if (err) {
            console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
        } else {
            console.log("Query succeeded.");

            data.Items.forEach(function (transaction) {
            	const precision = 1000000;
                totalEthInvested = totalEthInvested.plus(new BigNumber((Math.round(transaction.value*precision)/precision).toString()));
            });

            // continue scanning if we have more users, because
            // scan can retrieve a maximum of 1MB of data
            if (typeof data.LastEvaluatedKey != "undefined") {
                scanParams.ExclusiveStartKey = data.LastEvaluatedKey;
                dynamodbDocClient.scan(scanParams, onScan);
            } else {
                updateTotalBtc(totalEthInvested)
            }
        }
    }

    dynamodbDocClient.scan(scanParams, onScan);
}

const updateTotalBtc = (totalEthInvested, connection) => {
    const scanParams = {
        TableName: `${config.env}.btc_transactions`,
    }

    let totalBtcInvested = new BigNumber(0);

    const onScan = (err, data) => {
        if (err) {
            console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
        } else {
            console.log("Query succeeded.");

            data.Items.forEach(function (transaction) {
            	const precision = 1000000;
                totalBtcInvested = totalBtcInvested.plus(new BigNumber((Math.round(transaction.amount*precision)/precision).toString()));
            });

            // continue scanning if we have more users, because
            // scan can retrieve a maximum of 1MB of data
            if (typeof data.LastEvaluatedKey != "undefined") {
                scanParams.ExclusiveStartKey = data.LastEvaluatedKey;
                dynamodbDocClient.scan(scanParams, onScan);
            } else {
                updateContract(totalEthInvested, totalBtcInvested, connection)
            }
        }
    }

    dynamodbDocClient.scan(scanParams, onScan);
}

module.exports = updateContractData
