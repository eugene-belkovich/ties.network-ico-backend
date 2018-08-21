const config = require('../config');

//Connect to database
let connection = null;

const sign = require('ethjs-signer').sign;
const SignerProvider = require('ethjs-provider-signer');
let _trns_count = -1;

const provider = new SignerProvider(config.blockchain.host, {
    signTransaction: (rawTx, cb) => {
        connection.bc.web3.eth.estimateGas(rawTx, (error, result) => {
            if (error) {
                console.log(error);
                cb(error);
            } else {

                connection.bc.web3.eth.getTransactionCount(rawTx.from, (error, count) => {
                    if (error) {
                        console.log(error);
                        cb(error);
                    } else {
                    	//If we rapidly put many transactions to one block then
                    	//we should increment nonce manually. getTransactionCount returns 
                    	//number of confirmed transactions only
                        rawTx.nonce = count >= _trns_count ? count : _trns_count;
                        rawTx.gas = result;
                        cb(null, sign(rawTx, config.blockchain.signer_secret));
                        _trns_count = rawTx.nonce + 1;
                    }
                })
            }
        })
    },
    accounts: (cb) => cb(null, [config.blockchain.signer_address]),
});

class Connection {
    constructor() {
        if (connection)
            throw new Error('Only one connection should be created!');
        connection = this;

        const BlockChain = require('./BlockChain');

        this.bc = new BlockChain(provider);
    }

    async connect() {
        await this.bc.connect();
    }
}

module.exports = new Connection();