class BlockChain {
    constructor(provider){
        this.provider = provider;
    }

    async connect() {
    	if(!this.web3)
    		await this.loadContracts();
    	if(!this.web3)
    		throw new Error('No contracts found!');
    }

    async loadContracts(){
        const Contract = require('../contracts');
		const glob = require('glob');
		const path = require('path');

		let deployed = [];
		let names = [];
		const self = this;

		glob.sync( path.join(__dirname, '../contracts/*.json') ).forEach( function( file ) {
			let name = path.basename(file, '.json');
			self[name + 'Contract'] = Contract(name, self.provider);
			if(!self.web3)
				self.web3 = self[name + 'Contract'].web3;
			names.push(name);
			deployed.push(self[name + 'Contract'].deployed());
		});

		let contracts = await Promise.all(deployed);
		this.contracts = {};
		for(let i=0; i<contracts.length; ++i){
		    this.contracts[names[i]] = contracts[i];
		    this[names[i]] = contracts[i];
		}
    }
}

module.exports = BlockChain;