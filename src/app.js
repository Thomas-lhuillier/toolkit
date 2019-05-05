class App {
  constructor (tab, clearTab) {
    this.tab = tab
    this.clearTab = clearTab
  }

  async init () {
    this.canvas = document.createElement('canvas')
    this.image = new Image()

    this.onBrowserDisconnect = this.onBrowserDisconnect.bind(this)
    this.onPortMessage = this.onPortMessage.bind(this)

    try {
      await this.injectScript()
    } catch (err) {
      this.error = err
      return
    }

    // Set active icon
    this.setIcon('active')

    this.worker = new Worker('worker.js')
    this.worker.onmessage = this.onWorkerMessage.bind(this)
    this.worker.postMessage({ type: 'init' })
  }

  async injectScript () {
    return new Promise((resolve, reject) => {
      chrome.tabs.executeScript(this.tab.id, { file: 'injected.js' }, () => {
        const err = chrome.runtime.lastError
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
  }

  destroy (silent) {
    if (!silent) {
      this.port.postMessage({ type: 'destroy' })
    }

    this.port.onDisconnect.removeListener(this.onBrowserDisconnect)
    this.worker.postMessage({ type: 'destroy' })
    this.setIcon('default')
    this.clearTab(this.tab.id)
  }

  connect (port) {
    this.port = port
    this.port.onMessage.addListener(this.onPortMessage)
    this.port.onDisconnect.addListener(this.onBrowserDisconnect)

    this.port.postMessage({
      type: 'init'
    })

    this.captureTab()
  }

  onBrowserDisconnect () {
    this.destroy(true)
  }

  onPortMessage (event) {
    switch (event.type) {
      case 'mousePos':
        this.worker.postMessage({
          type: 'mousePos',
          coord: event.coord
        })
        break

      case 'color':
        this.port.postMessage({
          type: 'color',
          coord: event.data
        })
        break

      case 'viewportChange':
        this.captureTab()
        break

      case 'destroy':
        this.destroy()
        break

      case 'saveASE':
        this.saveFile(event.url)

        break
    }
  }

  onWorkerMessage (event) {
    const forward = ['color', 'screenshot processed', 'mousePos']
    if (forward.indexOf(event.data.type) > -1) {
      this.port.postMessage(event.data)
    }
  }

  async saveFile (url) {
    const handler = this.setFilename
    chrome.downloads.onDeterminingFilename.addListener(handler)

    const currentId = await this.download(url)
    const success = await this.onDownloadComplete(currentId).then(() => {
      chrome.downloads.onDeterminingFilename.removeListener(handler)
    })

    return success
  }

  setFilename (item, suggest) {
    suggest({ filename: 'black_shrimp-swatches.ase', overwrite: true })
  }

  download (url) {
    return new Promise(resolve => chrome.downloads.download({ url, saveAs: true }, resolve))
  }

  onDownloadComplete (itemId) {
    return new Promise(resolve => {
      chrome.downloads.onChanged.addListener(function onChanged ({ id, state }) {
        if (id === itemId && state && state.current !== 'in_progress') {
          chrome.downloads.onChanged.removeListener(onChanged)
          resolve(state.current === 'complete')
        }
      })
    })
  }

  setIcon (icon = 'default') {
    let path
    switch (icon) {
      case 'active':
        path = 'assets/img/icon16_alt.png'
        break

      default:
        path = 'assets/img/icon16.png'
        break
    }

    chrome.browserAction.setIcon({
      tabId: this.tab.id,
      path: {
        16: path
      }
    })
  }

  captureTab () {
    chrome.tabs.captureVisibleTab({ format: 'png' }, this.loadImage.bind(this))
  }

  loadImage (dataUrl) {
    this.image.onload = this.processCapture.bind(this)
    this.image.src = dataUrl
  }

  processCapture () {
    this.context = this.canvas.getContext('2d')

    // adjust the canvas size to the image size
    this.canvas.width = this.tab.width
    this.canvas.height = this.tab.height

    // draw the image to the canvas
    this.context.drawImage(
      this.image,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    )

    // store image data
    let imageData = this.context.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    ).data
    this.sendImageData(imageData)
  }

  sendImageData (imageData) {
    this.worker.postMessage(
      {
        type: 'imageData',
        imageData: imageData.buffer,
        width: this.canvas.width,
        height: this.canvas.height
      },
      [imageData.buffer]
    )

    this.port.postMessage({
      type: 'imageData',
      imageData: this.image.src,
      width: this.canvas.width,
      height: this.canvas.height
    })
  }
}

export default App