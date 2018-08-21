const updateBalances = require('./tasks/updateBalances')
const updateTransactions = require('./tasks/updateEthTransactions')
const updateContractData = require('./tasks/updateContractData')
const config = require('./config')

updateTransactions()
updateBalances()
updateContractData()

setInterval(updateBalances, config.timeout)
setInterval(updateContractData, config.timeout)