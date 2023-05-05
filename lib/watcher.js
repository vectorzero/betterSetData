import { getPathFields, getValByPath, updateValByPath } from './fieldsUtils'
import { isPlainObjectOrArray } from './typeUtils'
import { deepClone } from './deepClone'

export class Watcher {
  constructor(instance) {
    this.instance = instance
    this.dep = new Map()
    this.oldValMap = new Map()
    this.proxyMap = new Map()
    this.reactiveWatchMap = new Map()

    const { data, watch } = instance
    const watchKeys = Object.keys(watch)
    for (let i = 0, len = watchKeys.length; i < len; i++) {
      const path = watchKeys[i]
      const fields = getPathFields(path)
      const key = fields[0]

      // 初始化被监听对象(不直接监听data的目的是与小程序内部操作隔离，不然小程序自身对data的操作，如toJson，访问和修改等也会触发监听)
      const rawVal = deepClone(data[key])
      const watchData = {} // 缩减版data
      watchData[key] = rawVal

      const watchDataProxy = this.reactive(watchData, path)
      // 保存每个路径的唯一响应式对象
      this.reactiveWatchMap.set(key, {
        path,
        fields,
        proxy: watchDataProxy
      })
    }
  }

  // 触发依赖
  trigger() {
    if (this.dep.size) {
      // forEach每次循环都会调用函数，但是有js引擎层面（解释器）的优化
      this.dep.forEach((cb, path) => {
        cb()
        this.oldValMap.delete(path)
      })
      this.dep.clear()
    }
  }

  // 更新被监听的响应式对象，触发响应式对象的set，收集被监听路径的依赖
  updateWatchedData(path, newVal) {
    const fields = getPathFields(path)
    if (this.reactiveWatchMap.has(fields[0])) {
      const curWatch = this.reactiveWatchMap.get(fields[0])
      // 兄弟属性更新不触发回调
      if (fields.length === curWatch.fields.length && path !== curWatch.path) {
        return
      }
      // 父属性、子属性、自身更新触发回调
      updateValByPath(curWatch.proxy, path, newVal)
    }
  }

  // 收集被监听路径的依赖
  track(path, cb) {
    const newVal = getValByPath(this.instance.data, path)
    const oldVal = this.oldValMap.get(path)
    this.dep.set(path, cb.bind(null, newVal, oldVal))
  }

  // 创建响应式对象(只监听对象和数组)
  reactive(target, path) {
    if (!isPlainObjectOrArray(target)) {
      return target
    }

    // 已经代理过，直接返回
    const existingProxy = this.proxyMap.get(target)
    if (existingProxy) {
      return existingProxy
    }

    const { watch } = this.instance
    const cb = watch[path]

    const proxy = new Proxy(target, {
      get: (target, key, receiver) => {
        const result = Reflect.get(target, key, receiver)
        // 初次访问时保存旧值
        if (!this.oldValMap.has(path)) {
          this.oldValMap.set(path, deepClone(getValByPath(target, path)))
        }

        // 深度监听（惰性，只有属性被访问时才会开始监听）
        if (isPlainObjectOrArray(result)) {
          return this.reactive(result, path)
        }
        return result
      },

      set: (target, key, value, receiver) => {
        // 属性被更新时收集依赖
        this.track(path, cb)
        return Reflect.set(target, key, value, receiver)
      }
    })

    this.proxyMap.set(target, proxy)
    return proxy
  }
}