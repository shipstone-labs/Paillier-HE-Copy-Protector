use ic_cdk::api::management_canister::main::{
    VetKdPublicKeyRequest, VetKdPublicKeyResponse,
};
use ic_cdk_macros::update;
use candid::Principal;

/// Check if vetKeys (vetKD) is available on this subnet
/// This is a critical first step before attempting to use vetKeys
#[update]
pub async fn check_vetkd_support() -> Result<bool, String> {
    ic_cdk::println!("Checking vetKeys support on subnet...");
    
    // Try to get public key to verify vetKD is available
    let request = VetKdPublicKeyRequest {
        canister_id: None,
        derivation_path: vec![b"test".to_vec()],
        key_id: vec![0; 32], // Default key ID
    };
    
    match ic_cdk::call::<_, (VetKdPublicKeyResponse,)>(
        Principal::management_canister(),
        "vetkd_public_key",
        (request,)
    ).await {
        Ok(response) => {
            ic_cdk::println!("✓ vetKeys support confirmed");
            ic_cdk::println!("Public key length: {} bytes", response.0.public_key.len());
            Ok(true)
        },
        Err((code, msg)) => {
            ic_cdk::println!("✗ vetKeys not available: {:?} - {}", code, msg);
            Err(format!("vetKD not available on this subnet: {:?} - {}", code, msg))
        }
    }
}

/// Get vetKeys configuration information
#[update]
pub async fn get_vetkd_info() -> Result<String, String> {
    match check_vetkd_support().await {
        Ok(true) => {
            Ok(format!(
                "vetKeys is available on this subnet. \
                Key derivation and threshold operations are supported."
            ))
        },
        Err(e) => {
            Ok(format!(
                "vetKeys is NOT available on this subnet. \
                Error: {}. \
                Fallback mode will be used for testing.",
                e
            ))
        },
        _ => unreachable!(),
    }
}