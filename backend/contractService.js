import { ThorClient, VeChainProvider, ProviderInternalBaseWallet, signerUtils } from '@vechain/sdk-network';
import pkg from '@vechain/sdk-core';
const { ABIContract, Address, Hex, Transaction, HexUInt, Secp256k1 } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Contract configuration
const CONTRACT_ADDRESS = '0xa56903cf66bacca8fb5911eb759a8566bda978ac';
const NETWORK_URL = 'https://testnet.vechain.org/';
const REGISTRAR_PRIVATE_KEY = process.env.VECHAIN_PRIVATE_KEY;

// Contract ABI for gradeSubmission function
const GRADE_SUBMISSION_ABI = [{
  name: 'gradeSubmission',
  type: 'function',
  inputs: [
    { name: 'studentAddress', type: 'address' },
    { name: 'approved', type: 'bool' }
  ],
  outputs: [],
  stateMutability: 'nonpayable'
}];

// Initialize VeChain SDK
const thor = ThorClient.fromUrl(NETWORK_URL);
const abiContract = ABIContract.ofAbi(GRADE_SUBMISSION_ABI);


export async function gradeSubmissionOnChain(studentAddress, approved) {
  try {
    console.log(`Calling gradeSubmission for ${studentAddress}, approved: ${approved}`);

    // Create private key buffer
    const privateKeyBuffer = Hex.of(REGISTRAR_PRIVATE_KEY).bytes;
    
    // Derive the registrar address
    const registrarAddress = Address.ofPublicKey(Secp256k1.derivePublicKey(privateKeyBuffer)).toString();
    console.log('Registrar address:', registrarAddress);

    // Encode function call
    const encodedData = abiContract.encodeFunctionInput('gradeSubmission', [studentAddress, approved]);
    
    // Create transaction clause
    const clause = {
      to: CONTRACT_ADDRESS,
      value: '0x0',
      data: encodedData.toString() 
    };

    console.log('Building transaction...');

    const gasLimit = 200000;
    const txBody = await thor.transactions.buildTransactionBody(
      [clause],
      gasLimit
    );

    console.log('Transaction body built');

    // Sign and send transaction
    const wallet = new ProviderInternalBaseWallet([
      { 
        privateKey: Hex.of(REGISTRAR_PRIVATE_KEY).bytes, 
        address: registrarAddress
      }
    ]);
    const provider = new VeChainProvider(thor, wallet, false);
    const signer = await provider.getSigner(registrarAddress);

    console.log('Signer obtained, signing transaction...');

    // Sign the transaction
    const rawSignedTx = await signer.signTransaction(
      signerUtils.transactionBodyToTransactionRequestInput(txBody, registrarAddress)
    );

    console.log('Transaction signed');

    // Decode the signed transaction
    const signedTx = Transaction.decode(
      HexUInt.of(rawSignedTx.slice(2)).bytes,
      true
    );

    console.log('Sending transaction...');

    // Send the transaction
    const sendResult = await thor.transactions.sendTransaction(signedTx);
    const txId = sendResult.id;
    
    console.log('Transaction sent:', txId);
    
    // Wait for transaction receipt
    const receipt = await thor.transactions.waitForTransaction(txId);
    
    if (receipt && !receipt.reverted) {
      console.log('✅ Transaction successful!');
      if (approved) {
        console.log('✅ Rewards distributed automatically!');
      }
      return {
        success: true,
        txId: txId,
        receipt: receipt
      };
    } else {
      console.log('❌ Transaction reverted');
      console.log('Receipt:', JSON.stringify(receipt, null, 2));

      let revertReason = 'Transaction was reverted';
      if (receipt?.outputs?.[0]?.data && receipt.outputs[0].data !== '0x') {
        revertReason += ` - Data: ${receipt.outputs[0].data}`;
      }
      
      return {
        success: false,
        txId: txId,
        error: revertReason,
        receipt: receipt
      };
    }

  } catch (error) {
    console.error('Error calling gradeSubmission:', error);
    return {
      success: false,
      error: error.message || String(error)
    };
  }
}