import json
import hashlib
from datetime import datetime

def generate_next_version(prev_doc_json, new_status="GRANTED"):
    """
    Takes the previous consent document, increments the version,
    links the hashes cryptographically, and generates a valid SHA-256 hash.
    """
    prev_doc = json.loads(prev_doc_json)
    
    next_version = prev_doc["version"] + 1
    consent_id = prev_doc["consent_id"]
    previous_hash = prev_doc["hash"]
    
    # Format current UTC time
    now_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    
    # 1. Construct next version document structure
    next_doc = {
        "_id": f"CONSENT#{consent_id}#v{str(next_version).zfill(6)}",
        "docType": "consent_version",
        "consent_id": consent_id,
        "version": next_version,
        "user_id": prev_doc["user_id"],
        "consumer_id": prev_doc["consumer_id"],
        "purpose": prev_doc["purpose"],
        "status": new_status,
        "action": new_status,
        "previous_version_id": prev_doc.get("_id", f"CONSENT#{consent_id}#v{str(prev_doc['version']).zfill(6)}"),
        "created_at": now_str,
        "updated_at": now_str,
        "previous_hash": previous_hash
    }
    
    # 2. Serialize payload deterministically: user_id|consumer_id|purpose|status|version|previous_hash
    payload = (
        f"{next_doc['user_id']}|"
        f"{next_doc['consumer_id']}|"
        f"{next_doc['purpose']}|"
        f"{next_doc['status']}|"
        f"{next_doc['version']}|"
        f"{next_doc['previous_hash']}"
    )
    
    # 3. Compute deterministic SHA-256 hash
    sha256 = hashlib.sha256()
    sha256.update(payload.encode("utf-8"))
    next_doc["hash"] = sha256.hexdigest()
    
    return next_doc

def main():
    print("==================================================")
    print("      Consent Hash Chain Curl Command Generator      ")
    print("==================================================")
    print("Please paste the JSON document of the latest row below.")
    print("When finished, press Enter, then type 'END' and press Enter:")
    
    lines = []
    while True:
        line = input()
        if line.strip() == "END":
            break
        lines.append(line)
    
    prev_json_str = "\n".join(lines).strip()
    if not prev_json_str:
        print("Error: No JSON data provided.")
        return
        
    print("\nEnter the new status (e.g. GRANTED or REVOKED) [Default: GRANTED]:")
    new_status = input().strip() or "GRANTED"
    
    try:
        next_doc = generate_next_version(prev_json_str, new_status)
        
        # Format the JSON nicely to match the curl string format
        json_body = json.dumps(next_doc, indent=4)
        
        # Build the exact curl command string
        curl_command = f"""curl -s -X POST \\
  -H "Content-Type: application/json" \\
  -u admin:admin123 \\
  -d '{json_body}' \\
  http://localhost:5984/consents_db"""
        
        print("\n=== GENERATED READY-TO-RUN CURL COMMAND ===")
        print(curl_command)
        print("===========================================")
        
    except Exception as e:
        print(f"\nError processing JSON: {e}")

if __name__ == "__main__":
    main()
