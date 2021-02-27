const cds = require("@sap/cds")
const { cleanObject } = require("./helper")
const thisApplication = "sap-support-message-reporting";
const DEBUG = cds.debug(thisApplication);

// Does need destination service
// const cdse = require("cdse")

module.exports = cds.service.impl(async (srv) =>  {
  const incidentws = await cds.connect.to("incidentws")
  const { MessageHeaderSet, MessageAlogSet } = incidentws.entities

  const db = await cds.connect.to("db")
  const { MessageHeaderSet: dbMessageHeaderSet, MessageAlogSet: dbMessageAlogSet } = db.entities

  srv.on("loadDataAxios", async (req) => {
    const dbtx = db.transaction(req)
    const axios = require('axios');

    dbtx.run(DELETE.from(dbMessageHeaderSet))
    dbtx.run(DELETE.from(dbMessageAlogSet))

    var cookie = getCookie()
    const instance = axios.create({
      baseURL: 'https://launchpad.support.sap.com',
      timeout: 30000,
      headers: {'Cookie': cookie}
    })
    const response = await instance.get('/services/odata/incidentws/MessageHeaderSet?$inlinecount=allpages&$filter=((Source%20eq%20%27ALL%27)and%20(Status%20eq%20%273%27%20or%20Status%20eq%20%275%27%20or%20Status%20eq%20%27N%27%20or%20Status%20eq%20%27M%27%20or%20Status%20eq%20%27R%27%20or%20Status%20eq%20%27S%27%20or%20Status%20eq%20%27C%27%20or%20Status%20eq%20%271%27)%20and%20(LastUpdate%20eq%20%27ALL%27))&$skip=0&$top=10&$format=json')
    response.data.d.results.forEach(cleanObject);
    const responseMessageHeaderSet = response.data.d.results
    DEBUG && DEBUG(`Entries in the MessageHeaderSet ${responseMessageHeaderSet.length}`);
    // Store them locally
    const resultsetMessageHeaderSet = await dbtx.run([INSERT.into(dbMessageHeaderSet).rows(responseMessageHeaderSet)])
    responseMessageHeaderSet.forEach(async (value) => {
      DEBUG && DEBUG(`Read Pointer ${value.Pointer}`);
      const axiosResponseMessageAlogSet = await instance.get('/services/odata/incidentws/MessageAlogSet?$filter=(Pointer%20eq%20%27002075129400001469512021%27)&$format=json')
      axiosResponseMessageAlogSet.data.d.results.forEach(cleanObject);
      const responseMessageAlogSet = axiosResponseMessageAlogSet.data.d.results
      DEBUG && DEBUG(`${responseMessageAlogSet.length} entries for Pointer ${value.Pointer}`);
      if(responseMessageAlogSet.length > 0) {
        const resultsetMessageAlogSet = await dbtx.run([INSERT.into(dbMessageAlogSet).rows(responseMessageAlogSet)])
      }
    })
  })

  srv.on("loadData", async (req) => {
    const dbtx = db.transaction(req)
    const exttx = incidentws.transaction(req)

    dbtx.run(DELETE.from(dbMessageHeaderSet))
    dbtx.run(DELETE.from(dbMessageAlogSet))
    // TODO get count to allow packetized requets
    /*
    const cqnCountMessageHeaderSet = SELECT.from(MessageHeaderSet) // How To do a count with CQN?
    const rows = await tx.run(cqnCountMessageHeaderSet)
    DEBUG && DEBUG(`MessageHeaderSet has ${rows} rows`);
    */
    // Read Incidents from OSS
    const cqnMessageHeaderSet = SELECT.from(MessageHeaderSet) // .limit(2)
    // TODO: Add cookie to this request
    const responseMessageHeaderSet = await exttx.run(cqnMessageHeaderSet)
    DEBUG && DEBUG(`Entries in the MessageHeaderSet ${responseMessageHeaderSet.length}`);
    // Store them locally
    const resultsetMessageHeaderSet = await dbtx.run([INSERT.into(dbMessageHeaderSet).rows(responseMessageHeaderSet)])
    responseMessageHeaderSet.forEach(async (value) => {
      DEBUG && DEBUG(`Read Pointer ${value.Pointer}`);
      const cqnMessageAlogSet = SELECT.from(MessageAlogSet).where('Pointer =', value.Pointer)
      const responseMessageAlogSet = await exttx.run(cqnMessageAlogSet)
      DEBUG && DEBUG(`${responseMessageAlogSet.length} entries for Pointer ${value.Pointer}`);
      if(responseMessageAlogSet.length > 0) {
        const resultsetMessageAlogSet = await dbtx.run([INSERT.into(dbMessageAlogSet).rows(responseMessageAlogSet)])
      }
    })

    // console.log(resultset);
  })
})

function getCookie() {
  var cookie = "";
  if (process.env.VCAP_APPLICATION) {
    const VCAP_APPLICATION = JSON.parse(process.env.VCAP_APPLICATION)
    if (VCAP_APPLICATION.cookie) {
      cookie = VCAP_APPLICATION.cookie
    }
  } else {
    console.error("VCAP_APPLICATION not set")
  }
  return cookie
}
