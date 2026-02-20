import fetch from 'node-fetch';

const R365_BASE_URL = 'https://hwood.restaurant365.com';
const ODATA_BASE_URL = 'https://odata.restaurant365.net';
const USERNAME = process.env.R365_USERNAME!;
const PASSWORD = process.env.R365_PASSWORD!;
const DOMAIN = 'hwood';

interface AuthResponse {
  token: string;
  expires: string;
}

interface ItemPayload {
  Item_Name: string;
  Item_Display_Name: string;
  Item_Category_1: string;
  Item_Category_2?: string;
  Base_UOM: string;
  UOM_Size: number;
  Cost_Account: string;
  Is_Active: boolean;
  Measure_Type: string;
}

async function authenticate(): Promise<string> {
  console.log('Authenticating with R365...');

  const response = await fetch(`${R365_BASE_URL}/APIv1/Authenticate/JWT?format=json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      UserName: USERNAME,
      Password: PASSWORD,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Authentication failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json() as AuthResponse;
  console.log('✓ Authentication successful');
  console.log(`Token expires: ${data.expires}`);

  return data.token;
}

async function getODataMetadata() {
  const authHeader = 'Basic ' + Buffer.from(`${DOMAIN}\\${USERNAME}:${PASSWORD}`).toString('base64');

  console.log('\n=== Fetching OData metadata ===');
  const response = await fetch(`${ODATA_BASE_URL}/api/v2/views/$metadata`, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
    },
  });

  const text = await response.text();
  console.log(`Status: ${response.status} ${response.statusText}`);

  if (response.ok) {
    // Extract EntityType names from XML
    const entityMatches = text.matchAll(/<EntityType Name="([^"]+)">/g);
    const entityTypes = Array.from(entityMatches).map(m => m[1]);

    console.log(`\nFound ${entityTypes.length} entity types:`);
    entityTypes.forEach((name, i) => {
      if (i < 50) { // Show first 50
        console.log(`  - ${name}`);
      }
    });

    if (entityTypes.length > 50) {
      console.log(`  ... and ${entityTypes.length - 50} more`);
    }

    return entityTypes;
  }

  return [];
}

async function testODataEndpoints(entityTypes: string[]) {
  const authHeader = 'Basic ' + Buffer.from(`${DOMAIN}\\${USERNAME}:${PASSWORD}`).toString('base64');

  console.log(`\n=== Testing ALL entity endpoints ===`);

  const results: any = { success: [], unauthorized: [], notFound: [] };

  for (const entityName of entityTypes) {
    console.log(`\nTesting ${entityName}...`);
    try {
      const response = await fetch(`${ODATA_BASE_URL}/api/v2/views/${entityName}?$top=1`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      });
      const text = await response.text();
      console.log(`  Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        try {
          const json = JSON.parse(text);
          if (json.value && Array.isArray(json.value)) {
            console.log(`  ✓ SUCCESS - ${json.value.length} items`);
            results.success.push(entityName);
            if (json.value.length > 0) {
              const keys = Object.keys(json.value[0]);
              console.log(`  Fields (${keys.length}):`, keys.slice(0, 20).join(', '));
            }
          }
        } catch (e) {
          console.log(`  Response length: ${text.length} chars`);
        }
      } else if (response.status === 401) {
        console.log(`  ✗ Not authorized`);
        results.unauthorized.push(entityName);
      } else if (response.status === 404) {
        console.log(`  ✗ Not found`);
        results.notFound.push(entityName);
      }
    } catch (e) {
      console.log(`  Error: ${e}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`✓ Accessible (${results.success.length}):`, results.success.join(', '));
  console.log(`✗ Unauthorized (${results.unauthorized.length}):`, results.unauthorized.join(', '));
  console.log(`✗ Not Found (${results.notFound.length}):`, results.notFound.join(', '));
}

async function importItem(token: string, item: ItemPayload) {
  console.log('\nImporting test item...');
  console.log('Item data:', JSON.stringify(item, null, 2));

  // Try the Item endpoint (singular)
  const response = await fetch(`${R365_BASE_URL}/APIv1/Item?format=json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(item),
  });

  const responseText = await response.text();

  console.log(`\nResponse status: ${response.status} ${response.statusText}`);
  console.log('Response body:', responseText);

  if (!response.ok) {
    throw new Error(`Item import failed: ${response.status} ${response.statusText}\n${responseText}`);
  }

  try {
    const data = JSON.parse(responseText);
    console.log('✓ Item imported successfully');
    return data;
  } catch (e) {
    console.log('✓ Request successful (response not JSON)');
    return responseText;
  }
}

async function main() {
  try {
    // Get metadata and discover entity types
    const entityTypes = await getODataMetadata();

    if (entityTypes.length > 0) {
      // Test item-related endpoints
      await testODataEndpoints(entityTypes);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
