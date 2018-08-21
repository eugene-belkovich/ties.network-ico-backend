const fs = require('fs')
const { max } = require('lodash')
const Validator = require('wallet-address-validator')

const dynamodbDocClient = require('./database')

const ENV = 'local'

function addWallets() {
  const filePath = process.argv[2] || './btc.txt'
  const env = process.env.environment || ENV

  fs.readFile(filePath, 'utf8', function (err, data) {
    if (err) {
      return console.log(err)
    }
    const walletsToAdd = data.split('\r\n')
    console.log(walletsToAdd)

    const promiseFalse = dynamodbDocClient.query({
      TableName: `${env}.btc_wallets`,
      ScanIndexForward: false,
      IndexName: 'lockedForever-order-index',
      KeyConditionExpression: 'lockedForever = :false',
      ExpressionAttributeValues: {
        ':false': 'false',
      },
    }).promise()

    const promiseTrue = dynamodbDocClient.query({
      TableName: `${env}.btc_wallets`,
      ScanIndexForward: false,
      IndexName: 'lockedForever-order-index',
      KeyConditionExpression: 'lockedForever = :false',
      ExpressionAttributeValues: {
        ':false': 'false',
      },
    }).promise()


    return Promise.all([promiseFalse, promiseTrue])
      .then(data => {
        const maxOrder = max([...data[0].Items.map(x => x.order), ...data[1].Items.map(x => x.order)])
        let errors = 0

        return walletsToAdd.reduce((promise, wallet, index) => {
          return promise
            .then(() => {
              console.log(Validator.validate(wallet, 'BTC'))
              if (!Validator.validate(wallet, 'BTC')) {
                return Promise.reject('Invalid Address')
              }
              return dynamodbDocClient.putItem({
                TableName: `${env}.btc_wallets`,
                Item: {
                  wallet: wallet,
                  order: index + maxOrder - errors + 1,
                  lockedForever: 'false',
                },
                ConditionExpression: `attribute_not_exists(wallet)`,
              }).promise()
            })
            .catch((err) => {
              console.log(err)
              errors++
              return Promise.resolve()
            })
        }, Promise.resolve())

      })
      .catch(data => {
        console.log(data)
      })
  })
}

addWallets()
