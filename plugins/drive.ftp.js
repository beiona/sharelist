/*
 * FTP
 */


const name = 'FTP'

const version = '1.0'

const protocols = ['ftp']

const defaultProtocol = 'ftp'

const path = require('path')

const ftp = require("basic-ftp")

const { URL } = require("url")

const { Writable } = require('stream')

const clientMap = {}

module.exports = ({ getConfig, cache }) => {

  const extname = (p) => path.extname(p).substring(1)

  const getPath = (url) => {
    let { pathname } = new URL('ftp:' + url);
    return pathname
  }

  const getClient = async (url, cd = false) => {
    let key = (url.match(/\/\/[\w\W]+?\//) || [''])[0];
    let { username, password, host, port, pathname } = new URL('ftp:' + url);
    
    /*
    let client = clientMap[key]

    if (client && client.closed == false) {
      if (pathname) {
        if (cd) {
          pathname = pathname.replace(/\/[^\/]+?$/, '')
        }
        console.log('cd1')
        await client.cd(pathname);
      }
      return client
    } 
    */
    let client = new ftp.Client();
    let flag = false
    client.ftp.verbose = false
    try {
      await client.access({
        host: host,
        user: username,
        password: password,
        port: port || 21,
        secure: false
      })

      if (pathname) {
        if (cd) {
          pathname = pathname.replace(/\/[^\/]+?$/, '')
        }
        await client.cd(pathname);
      }
      flag = true
    } catch (err) {
      flag = false
    }

    if (flag) {
      //clientMap[key] = client
      return client;
    }

  }

  const folder = async (id) => {
    let resid = `${defaultProtocol}:${id}`
    let r = cache(resid)
    let resp = { id: id, type: 'folder', protocol: defaultProtocol }

    if (r) {
      resp = r
      if (
        resp.$cached_at &&
        resp.children &&
        (Date.now() - resp.$cached_at < getConfig().max_age_dir)

      ) {
        console.log('get ftp folder from cache')
        return resp
      }
    }

    let client = await getClient(id)

    if (client) {
      let data = await client.list();

      //client.close()

      let children = [];

      data.forEach(i => {
        let path = (id + '/' + i.name).replace(/(?<=.+)\/{2,}/g, '/')
        let obj = {
          id: path,
          name: i.name,
          protocol: defaultProtocol,
          size: i.size,
          created_at: i.date,
          updated_at: i.date,
          ext: extname(i.name),
          type: 'other'
        }
        /*
          Unknown = 0,
          File = 1,
          Directory = 2,
          SymbolicLink = 3
        */
        if (i.type == 2 || i.type == 3) {
          obj.type = 'folder'
        }

        children.push(obj)
      })

      resp.$cached_at = Date.now()
      resp.children = children
      cache(resid, resp)

      return resp
    } else {
      return false
    }
  }

  const file = async (id) => {
    let client = await getClient(id , true)
    let resp = {
      id,
      name: path.basename(id),
      ext: extname(id),
      url: id,
      protocol: defaultProtocol,
      outputType: 'stream',
      proxy: true
    }

    let file = id.split('/').pop()

    if (client) {
      let size = await client.size(file)
      resp.size = size
      //client.close()
    }

    return resp
  }

  const stream = async (id, startAt = 0, writableStream) => {
    let client = await getClient(id, true)
    let file = id.split('/').pop()
    if (client) {
      if (writableStream) {
        return await client.download(writableStream, file, startAt)
      } else {
        let dest = new Writable()
        await client.download(dest, file, startAt)
        return dest
      }
    } else {
      return null
    }
  }

  return { name, version, drive: { protocols, folder, file, stream } }
}
