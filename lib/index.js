import { Watcher } from './watcher'
import BetterSetData from './betterSetData'

/**
 * 增强单个页面
 */
const betterPage = function (pageOpts, options) {
  const { onLoad, watch = null } = pageOpts
  let watcher = null
  pageOpts.onLoad = function (...args) {
    if (watch) {
      watcher = new Watcher(this)
    }
    new BetterSetData(this, watcher, options === null || options === void 0 ? void 0 : options.betterOptions)
    onLoad === null || onLoad === void 0 ? void 0 : onLoad?.apply(this, args)
  }
  Page(pageOpts)
}

/**
 * 增强单个组件
 */
const betterComponent = function (compOpts, options) {
  const { lifetimes = {}, watch } = compOpts
  let ref = compOpts
  if (lifetimes.created) {
    ref = compOpts.lifetimes
  }
  const oriCreated = ref.created || function () { }
  let watcher = null
  ref.created = function (...args) {
    if (watch) {
      this.watch = watch
      watcher = new Watcher(this)
    }
    new BetterSetData(this, watcher, options)
    oriCreated?.apply(this, args)
  }
  return Component(compOpts)
}

/**
 * 增强全局所有页面钩子
 */
function useBetterAllPage() {
  const originalPage = Page
  Page = function (pageOpts, options) {
    const { onLoad, watch = null } = pageOpts
    let watcher = null
    pageOpts.onLoad = async function (...args) {
      if (watch) {
        watcher = new Watcher(this)
      }
      new BetterSetData(this, watcher, options)
      onLoad?.apply(this, args)
    }
    originalPage(pageOpts)
  }
}

/**
 * 增强全局所有组件钩子
 */
function useBetterAllComponent() {
  const originalComponent = Component
  Component = function (compOpts, options) {
    const { lifetimes = {}, watch = null } = compOpts
    let lifetimesObj = compOpts
    if (lifetimes.created) {
      lifetimesObj = compOpts.lifetimes
    }
    const oriCreated = lifetimesObj.created || function () { }
    let watcher = null
    lifetimesObj.created = function (...args) {
      if (watch) {
        this.watch = watch
        watcher = new Watcher(this)
      }
      new BetterSetData(this, watcher, options)
      oriCreated?.apply(this, args)
    }
    return originalComponent(compOpts)
  }
}

export {
  betterPage as Page,
  betterComponent as Component,
  useBetterAllPage,
  useBetterAllComponent,
}