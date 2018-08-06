const debug = require('debug')
const { shouldOk, shouldNotIntercept } = require('./utils')
const { fy, boxlog } = require('./logger')
const storage = require('./storage')

const logger = debug('prm:response')

module.exports = function createHandler (params) {
  const { reqSet, workDir, mockList, okList, verbose, force, ci } = params

  logger('Creating response handler')

  return function handlerResponse(interceptedResponse) {
    const request = interceptedResponse.request()
    const postData = request.postData() || ''
    const url = request.url()
    const method = request.method()
    const resParams = { url, method, postData }

    logger(`» Intercepted response with method "${method}" and url "${url}"`)

    if (verbose) {
      console.log(`Response handling for:\n${fy(resParams)}`)
      console.log('decodeURIComponent(postData)', decodeURIComponent(postData))
      console.log('encodeURIComponent(postData)', encodeURIComponent(postData))
    }

    // If synthetic OK-response, no needs to write it to fs
    if (shouldNotIntercept(mockList, okList, url) || shouldOk(mockList, okList, url)) {
      logger('» shouldNotIntercept or shouldOk. Skipping.')

      return
    }

    logger('» Preparing to write a new file (if it does not exist)')

    interceptedResponse.text()
      .then((text) => {
        logger(`« Response text starts with: ${text.substr(0, 100)}`)
        logger(`« Sending the response to storage.write`)

        return storage.write({
          url,
          method,
          postData,
          body: `${method.toUpperCase()} ${url} ${postData}\n\n${text}`,
          workDir,
          skipQueryParams: params.skipQueryParams,
          skipPostParams: params.skipPostParams,
          force,
          ci,
          verbose
        }).then((e) => {
          logger(`« Successfully exited from storage.write for file ${e.names.absFileName}`)

          reqSet.delete(e.names.absFileName)
        })
      })
      .catch((err) => {
        logger('« interceptedResponse.text error:', err)
      })
      .then(() => { // finally
        logger(`« About to exit the response handler. reqSet.size is ${reqSet.size}`)

        if (reqSet.size === 0) {
          logger('« Invoking _onReqsCompleted')

          params._onReqsCompleted()

          logger('« Response is done.')
        }
      })
  }
}