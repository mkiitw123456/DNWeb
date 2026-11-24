import pg from "pg";
const rootCertificate = '-----BEGIN CERTIFICATE-----\nMIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL\nBQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l\ndyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh\nc2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow\nazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD\nYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug\nUm9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW\nQyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q\nDmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2\nGtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi\ncvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4\nO4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt\nNaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX\nuXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt\naUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU\ntVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b\nVW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6\njB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx\nCea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2\nCMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P\no/bKiIz+Fq8=\n-----END CERTIFICATE-----\n';

export const usePostgres = () => Boolean(process.env.DDSTAR_DATABASE_URL);
let pool;
function connection() {
  if (!pool) {
    const url = new URL(process.env.DDSTAR_DATABASE_URL);
    const schema = process.env.VERCEL ? "ddstar" : process.env.DDSTAR_TEST_SCHEMA || "ddstar";
    if (!/^ddstar(?:_qa_[a-z0-9]+)?$/.test(schema)) throw Error("Invalid database schema");
    pool = new pg.Pool({host:url.hostname, port:Number(url.port || 5432), user:decodeURIComponent(url.username),
      password:decodeURIComponent(url.password), database:"postgres", max:3, idleTimeoutMillis:10000,
      connectionTimeoutMillis:8000, ssl:{ca:rootCertificate,rejectUnauthorized:true}});
    pool.on("error", error => console.error("Database connection closed",error.code));
  }
  return pool;
}
export async function pgTransaction(work) {
  const schema = process.env.VERCEL ? "ddstar" : process.env.DDSTAR_TEST_SCHEMA || "ddstar";
  for (let attempt=0;;attempt++) {
    const client=await connection().connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('search_path',$1,true)", [schema+",pg_catalog"]);
      const {rows}=await client.query("select active from cutover where id=true");
      if (!rows[0]?.active) throw Object.assign(Error("資料庫切換中，請稍後重試"),{status:503});
      const result=await work(client);
      await client.query("commit");
      return result;
    } catch(error) {
      await client.query("rollback").catch(()=>{});
      if (!["40001","40P01"].includes(error.code) || attempt>=5) throw error;
    } finally {client.release();}
    await new Promise(resolve=>setTimeout(resolve,10*(attempt+1)+Math.random()*20));
  }
}
export async function getDoc(c,path) {
  return (await c.query("select body from documents where path=$1",[path])).rows[0]?.body ?? null;
}
export async function guildDoc(c) {
  const guild=await getDoc(c,"dnweb/state");
  if (!guild) throw Object.assign(Error("公會資料尚未就緒"),{status:503});
  return guild;
}
export async function putDoc(c,path,body) {
  await c.query("insert into documents(path,body) values($1,$2) on conflict(path) do update set body=excluded.body",[path,JSON.stringify(body)]);
}
