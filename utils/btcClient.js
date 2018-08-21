const fetch = require('node-fetch')
const config = require('../config')
const URL = `http://${config.btcNodeHost}:3001/insight-api`

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    getBaseURL: function () {
        return this.URL || URL
    },
    getTxsForAddress: function (address, from, to) {
        return fetch(`${this.getBaseURL()}/addrs/${address}/txs?from=${from}&to=${to}`).then(res => res.json())
    },
    hasHeight: function (blocks, height){
    	if(!height)
    		return true;
    	return blocks.filter(b => b.height == height).length > 0;
    },
    getBlocks: async function(lastProcessedHeight) {
    	let blocks = await this.getBlocksForDate();
    	if(!blocks || !blocks.blocks)
    		return blocks;
    	
    	let out = { blocks: blocks.blocks };

    	if(!this.hasHeight(blocks.blocks, lastProcessedHeight)){
    		for(let i=0; i<5; ++i){ //No more than 5 days back
    			blocks = await this.getBlocksForDate(blocks.pagination.prev);
    			if(!blocks || !blocks.blocks)
    				break;
   				out.blocks = out.blocks.concat(blocks.blocks);
   				if(this.hasHeight(blocks.blocks, lastProcessedHeight))
   					break;
    		}
    	}

    	return out;
    },
    getBlocksForDate: async function(date){
    	let url = `${this.getBaseURL()}/blocks?limit=1000`;
    	if(date) url += `&blockDate=${date}`;

        return fetch(url).then(async (res) => {
            if(res.status !== 200) {
                const text = await res.text()
                console.log(`Fetch failed, response: ${text}, retrying`)

                await timeout(5000)

                return this.getBlocksForDate(date)
            }

            return res.json()
        }).catch(async (err) => {
            console.log(err)

            await timeout(5000)

            return this.getBlocksForDate(date)
        })
    },
    getBlockTransactions: function(blockHash, pageNumber) {
        return fetch(`${this.getBaseURL()}/txs?block=${blockHash}&pageNum=${pageNumber}`).then(res => res.json())
    },
    getTransaction: function(txid) {
        return fetch(`${this.getBaseURL()}/tx/${txid}`).then(async (res) => {
            if(res.status !== 200) {
                const text = await res.text()
                console.log(`Fetch failed, response: ${text}, retrying`)

                await timeout(5000)

                return this.getTransaction(txid)
            }

            return res.json()
        }).catch(async (err) => {
            console.log(err)

            await timeout(5000)

            return this.getTransaction(txid)
        })
    }
};