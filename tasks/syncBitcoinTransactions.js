const btcClient = require('../utils/btcClient')
const dynamodbDocClient = require('../utils/database')
const RpcClient = require('bitcoind-rpc')
const io = require('socket.io-client')
const config = require('../config')

checkForNewBlocks = async () => {
    console.log(`Started syncing btc transactions`)

    const btcProcessingData = await dynamodbDocClient.getItem({
        'TableName': `${config.env}.btc_processing_data`,
        'Key': {
            'key': 'key'
        }
    }).promise()

    const processedBlockHeight = btcProcessingData.Item.blockHeight

    console.log(`Last processed block height: ${processedBlockHeight}`)

    const blocks = await btcClient.getBlocks(processedBlockHeight)

    if(blocks && blocks.blocks) {

        const blocksToProcess = blocks.blocks.filter((block) => block.height > processedBlockHeight)

        blocksToProcess.sort((a, b) => a.height - b.height)

        console.log(`There are ${blocksToProcess.length} blocks to process`)

        for (let block of blocksToProcess) {
            await processBlock(block)
        }

    }

    console.log(`Finished syncing btc blocks, rescheduling`)

    setTimeout(checkForNewBlocks, config.timeout)
}

processBlock = async (block) => {
    console.log(`Processing block ${block.height} ${block.hash}`)

    let transactionsData = await btcClient.getBlockTransactions(block.hash, 0)

    const totalTransactionsPages = transactionsData.pagesTotal

    let transactions = transactionsData.txs

    for (let transaction of transactions) {
        await processTransaction(transaction)
    }

    for (let pageNumber = 1; pageNumber <= totalTransactionsPages; ++pageNumber) {
        transactionsData = await btcClient.getBlockTransactions(block.hash, pageNumber)

        let transactions = transactionsData.txs

        for (let transaction of transactions) {
            await processTransaction(transaction)
        }
    }

    await markBlockAsProcessed(block)
}

markBlockAsProcessed = async (block) => {
    console.log(`Marking ${block.height} as processed`)

    await dynamodbDocClient.updateItem({
        'TableName': `${config.env}.btc_processing_data`,
        'Key': {
            'key': 'key',
        },
        UpdateExpression: 'SET blockHeight = :blockHeight',
        ExpressionAttributeValues: {
            ':blockHeight': block.height,
        }
    }).promise()
}

processTransaction = async (transaction) => {
    console.log(`Started syncing transaction ${transaction.txid}`)

    const filteredVouts = []

    for (let vout of transaction.vout) {
        if (!vout.scriptPubKey.addresses || vout.scriptPubKey.addresses.length === 0) {
            continue
        }

        const btcAddress = await dynamodbDocClient.getItem({
            'TableName': `${config.env}.btc_wallets`,
            'Key': {
                'wallet': vout.scriptPubKey.addresses[0]
            }
        }).promise()

        if (!!btcAddress.Item) {
            filteredVouts.push(vout)
        }
    }

    const transformedTransactions = filteredVouts.map((vout) => transformVout(transaction, vout))

    for (let transformedTransaction of transformedTransactions) {
        await syncTransaction(transformedTransaction)
    }
}

transformVout = (transaction, vout) => {
    return {
        txid: transaction.txid,
        n: vout.n,
        address: vout.scriptPubKey.addresses[0],
        amount: vout.value,
        confirmations: transaction.confirmations,
    }
}

syncTransaction = async (transaction) => {
    let databaseTransactionData = await dynamodbDocClient.getItem({
        'TableName': `${config.env}.btc_transactions`,
        'Key': {
            'txid': transaction.txid,
            'n': transaction.n
        }
    }).promise()

    if (databaseTransactionData.Item) {
        console.log(`Skipping already existing transaction ${transaction.txid}`)
        return
    }

    const walletData = await dynamodbDocClient.getItem({
        TableName: `${config.env}.btc_wallets`,
        Key: {
            "wallet": transaction.address
        }
    }).promise()

    const wallet = walletData.Item

    databaseTransactionData = await dynamodbDocClient.putItem({
        'TableName': `${config.env}.btc_transactions`,
        'Item': {
            'txid': transaction.txid,
            'n': transaction.n,
            'amount': transaction.amount,
            'status': 'unprocessed',
            'confirmations': transaction.confirmations,
            'sendTo': wallet.userId,
            'timestamp': new Date().getTime()
        }
    }).promise()

    await dynamodbDocClient.updateItem({
        TableName: `${config.env}.btc_wallets`,
        Key: {
            "wallet": transaction.address
        },
        UpdateExpression: 'SET lockedForever = :true',
        ExpressionAttributeValues: {
            ':true': 'true',
        }
    }).promise()

    console.log(`Synced new transaction: ${transaction.txid} ${transaction.n}`)
}

syncMempool = async () => {
    console.log(`Started syncing mempool`)

    const rpcConfig = {
        protocol: 'http',
        user: 'bitcoin',
        pass: 'local321',
        host: config.btcNodeHost,
        port: config.btcNodePort,
    };

    const rpc = new RpcClient(rpcConfig);

    rpc.getRawMemPool(async (err, response) => {
        if (err) {
            console.error(err);
            setTimeout(syncMempool, config.timeout * 2)
        }

        const txids = response.result

        for (txid of txids) {
            const transaction = await btcClient.getTransaction(txid)
            await processTransaction(transaction)
        }

        console.log(`Finished syncing mempool, rescheduling`)
        setTimeout(syncMempool, config.timeout)
    })
}

listenForMempool = async () => {
    console.log(`Now listening for new mempool transactions`)

    var socket = io(`http://${config.btcNodeHost}:3001`);
    socket.on('connect', function () {
        socket.emit('subscribe', 'inv')
    })
    socket.on('tx', async function (data) {
        console.log("New transaction received: " + data.txid)
        const transaction = await btcClient.getTransaction(data.txid)
        await processTransaction(transaction)
    })
}

module.exports.listenForMempool = listenForMempool

module.exports.checkForNewBlocks = checkForNewBlocks

module.exports.syncMempool = syncMempool