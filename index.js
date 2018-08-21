const btc = require('./tasks/syncBitcoinTransactions')
const updateTransactionConfirmations = require('./tasks/updateBtcConfirmations')

//btc.listenForMempool()
btc.checkForNewBlocks()
btc.syncMempool()
updateTransactionConfirmations()