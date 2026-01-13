"""
Test script per verificare il salvataggio e recupero formule dal backend
"""
import requests
import json

BASE_URL = "http://localhost:8000/api"

def test_formula_persistence():
    print("="*60)
    print("TEST: Backend Formula Persistence")
    print("="*60)
    
    # 1. Verifica connessione
    print("\n1. Testing connection...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"   Health check: {response.status_code}")
    assert response.status_code == 200, "Backend not running"
    
    # 2. Get sheets
    print("\n2. Getting sheets...")
    response = requests.get(f"{BASE_URL}/sheets")
    sheets = response.json()
    print(f"   Found {len(sheets)} sheets")
    
    if not sheets:
        print("   No sheets found. Please import data first!")
        return
    
    table_name = sheets[0]['tableName']
    print(f"   Using table: {table_name}")
    
    # 3. Get schema
    print("\n3. Getting schema...")
    response = requests.get(f"{BASE_URL}/schema", params={"table": table_name})
    schema = response.json()
    print(f"   Columns: {[col['name'] for col in schema['columns'][:5]]}...")
    
    pk_column = schema['columns'][0]['name']
    test_column = schema['columns'][2]['name'] if len(schema['columns']) > 2 else schema['columns'][1]['name']
    
    # 4. Update cell with formula
    print("\n4. Updating cell with formula...")
    update_payload = {
        "table": table_name,
        "rowId": 1,  # First row
        "column": test_column,
        "value": 999,  # Calculated value
        "formula": "=A1+B1"  # Test formula
    }
    
    print(f"   Payload: {json.dumps(update_payload, indent=2)}")
    
    response = requests.post(f"{BASE_URL}/cell/update", json=update_payload)
    print(f"   Update response: {response.status_code}")
    
    if response.status_code != 200:
        print(f"   ERROR: {response.text}")
        return
    
    print("   ✅ Formula saved!")
    
    # 5. Retrieve formulas
    print("\n5. Retrieving formulas...")
    response = requests.get(f"{BASE_URL}/formulas", params={"table": table_name})
    formulas = response.json()
    
    print(f"   Found {len(formulas)} formulas")
    
    # Check if our formula is there
    our_formula = next((f for f in formulas if f['column'] == test_column and str(f['rowId']) == '1'), None)
    
    if our_formula:
        print(f"   ✅ Formula retrieved: {our_formula}")
        print(f"      Row: {our_formula['rowId']}")
        print(f"      Column: {our_formula['column']}")
        print(f"      Formula: {our_formula['formula']}")
    else:
        print(f"   ❌ Formula NOT found in database!")
        print(f"   All formulas: {formulas}")
    
    # 6. Verify cell value
    print("\n6. Verifying cell value...")
    query_sql = f"SELECT \"{test_column}\" FROM {table_name} WHERE \"{pk_column}\" = 1"
    response = requests.post(f"{BASE_URL}/query", json={"sql": query_sql})
    result = response.json()
    
    if result['rows']:
        value = result['rows'][0][0]
        print(f"   Cell value: {value}")
        print(f"   ✅ Cell updated correctly!")
    
    print("\n" + "="*60)
    print("TEST COMPLETED")
    print("="*60)

if __name__ == "__main__":
    try:
        test_formula_persistence()
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Cannot connect to backend. Make sure it's running on port 8000")
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
