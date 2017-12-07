'use strict';

angular.module('insight.token').controller('TokenController',
function($routeParams, $rootScope, $location, ERC20ContractInfo, ERC20Transfers, ERC20AddressBalances, ERC20Holders, ContractRepository, SolidityCoder, Web3Utils, Contracts, BigNumber) {

	if (!Web3Utils.isAddress($routeParams.address) && !Contracts.isValidQtumAddress($routeParams.address)) {

		$rootScope.flashMessage = 'Invalid Address: ' + $routeParams.address;
        $location.path('/e404').replace();

        return false;

	}

    if (Web3Utils.isAddress($routeParams.address)) {

        var addrStr = Contracts.getBitAddressFromContractAddress($routeParams.address);

        $location.path('/token/' + addrStr).replace();

        return false;

    }

	var self = this;
	var BALANCE_OF_METHOD_HASH = '70a08231';
	var ALLOWANCE_METHOD_HASH = 'dd62ed3e';

	self.tokenInfo = {};
	self.transfers = {};
	self.holders = {};

    self.filterByAddress = $routeParams.a;
    self.addressBalance = null;

	self.readSmartContractTab = {
		balanceOf: {
			owner_address: '',
			inProcess: false,
            owner_error: '',
			balance: 0,
			requested_address: '',
            process_address: ''
		},
		allowance: {
            owner_address: '',
            spender_address: '',
            inProcess: false,
            owner_error: '',
            spender_error: '',
            owner_requested_address: '',
            owner_process_address: '',
            spender_requested_address: '',
            spender_process_address: ''
		}
	};

    var contractEthAddress = Contracts.getEthAddressFromBitAddress($routeParams.address);

	self.contractAddress = $routeParams.address;

	self.tab = $routeParams.tab && ['transfers', 'holders', 'read-smart-contract'].indexOf($routeParams.tab) !== -1 ? $routeParams.tab : 'transfers';

	var _loadTabContent = function(offset) {
		switch(self.tab){
			case 'transfers': {
				_getTransfers(offset ? offset : 0);
				break;
			}
			case 'holders': {
				_getHolders(offset ? offset : 0);
				break;
			}
			case 'read-smart-contract': {
				break;
			}
		}
	};

	self.getPercent = function (total, amount) {
		var amountBN = new BigNumber(amount);
		return amountBN.dividedBy(total).toString(10);
	};

	var _getTransfers = function(offset) {

		ERC20Transfers.get({
			address: contractEthAddress,
			offset: offset,
			'addresses[]': (self.filterByAddress) ? self.filterByAddress: null
		}).$promise.then(function (trList) {
			self.transfers = trList;
			self.transfers.pages = self.transfers.count && self.transfers.limit ? Math.ceil(self.transfers.count / self.transfers.limit) : 0;
		});
	};

	var _getHolders = function(offset) {

		return ERC20Holders.get({
			address: contractEthAddress,
			offset: offset
		}).$promise.then(function (holderList) {
			self.holders = holderList;
			self.holders.pages = self.holders.count && self.holders.limit ? Math.ceil(self.holders.count / self.holders.limit) : 0;
		});

	};

	var _loadTokenInfo = function() {

        ERC20ContractInfo.get({
            contractAddress: contractEthAddress,
            address: self.filterByAddress ? self.filterByAddress : null
        }, function (info) {

            if (info) {
                self.tokenInfo = info;

                try {
                    self.tokenInfo.contract_address_base = Contracts.getBitAddressFromContractAddress(self.tokenInfo.contract_address);
                } catch (e) {
                    console.log('Error convert', self.tokenInfo);
                }

            }

        });

		if (self.filterByAddress) {

            ERC20AddressBalances.get({
                contractAddress: contractEthAddress,
                balanceAddress: self.filterByAddress
            }).$promise.then(function (balance) {
                self.addressBalance = balance;
            }).catch(function (err) {
                console.log(err);
			})

		}

	};

	self.init = function() {
		_loadTokenInfo();
		_loadTabContent();
	};

	self.paginate = function(offset) {

		if (self[self.tab].limit && self[self.tab].pages > offset / self[self.tab].limit && offset >= 0 && self[self.tab].offset !== offset) {
			_loadTabContent(offset);
		}
	};

	self.setTab = function(tabName) {

		if (self.tab === tabName) {
			return;
		}

		self.tab = tabName;
        $location.path('/token/' + $routeParams.address + '/' + tabName, false);
		_loadTabContent();

	};

    var getEthConvertedAddress = function (address) {

    	try {

    		if (Contracts.isValidQtumAddress(address)) {

                var ethAddress = Contracts.getEthAddressFromBitAddress(address);

                if (ethAddress) {
                    return ethAddress;
                }

            }

    		address = address.toLowerCase();

            if (Web3Utils.isAddress(address)) {
                return address;
            }

		} catch (e) {
            console.log(e);
		}


        return null;
	};

    /**
	 * BalanceOf row
     */
	self.getAddressBalance = function () {

		var balanceOfData = self.readSmartContractTab.balanceOf;

        if (balanceOfData.inProcess) {
        	return false;
		}

		var userAddress = balanceOfData.owner_address;
        var processAddress = getEthConvertedAddress(userAddress);

		if (!processAddress) {
            balanceOfData.owner_error = "Invalid address";
            return false;
		}

        balanceOfData.owner_error = "";
        balanceOfData.inProcess = true;

        return ContractRepository.call({
        	address: contractEthAddress,
			hash: BALANCE_OF_METHOD_HASH + SolidityCoder.encodeParam('address', Web3Utils.toAddress(processAddress))
		}).$promise.then(function (info) {

			balanceOfData.requested_address = userAddress;
			balanceOfData.process_address = processAddress;

			balanceOfData.owner_address = '';
            balanceOfData.inProcess = false;

            if (info && info.executionResult) {
                try {
                    var decodedBalance = SolidityCoder.decodeParam("uint256", info.executionResult.output);
                    balanceOfData.balance = decodedBalance.toString(10);
                } catch (e) {
                    balanceOfData.balance = 0;
				}
			}

        });
	};


    /**
	 * Allowance row
     */
	self.getAllowanceAmount = function () {

		var allowanceData = self.readSmartContractTab.allowance;

        if (allowanceData.inProcess) {
        	return false;
		}

        var userOwnerAddress = allowanceData.owner_address;
        var processOwnerAddress = getEthConvertedAddress(userOwnerAddress);

        if (!processOwnerAddress) {
            allowanceData.owner_error = "Invalid address";
            return false;
        } else {
            allowanceData.owner_error = "";
		}

        var userSpenderAddress = allowanceData.spender_address;
        var processSpenderAddress = getEthConvertedAddress(userSpenderAddress);

        if (!processSpenderAddress) {
            allowanceData.spender_error = "Invalid address";
            return false;
        } else {
            allowanceData.spender_error = "";
		}

        allowanceData.inProcess = false;

        return ContractRepository.call({
            address: contractEthAddress,
            hash: ALLOWANCE_METHOD_HASH + SolidityCoder.encodeParam('address', Web3Utils.toAddress(processOwnerAddress)) + SolidityCoder.encodeParam('address', Web3Utils.toAddress(processSpenderAddress))
        }).$promise.then(function (info) {

            allowanceData.owner_requested_address = allowanceData.owner_address;
            allowanceData.owner_process_address = processOwnerAddress;
            allowanceData.spender_requested_address = allowanceData.spender_address;
            allowanceData.spender_process_address = processSpenderAddress;

            allowanceData.owner_address = '';
            allowanceData.spender_address = '';

            allowanceData.inProcess = false;

            if (info.executionResult) {
                try {
                    var decodedBalance = SolidityCoder.decodeParam("uint256", info.executionResult.output);
                    allowanceData.balance = decodedBalance.toString(10)
                } catch (e) {
                    allowanceData.balance = 0;
                }
            }

        });

	};

});
