import History from 'express-history-api-fallback';

var C = {};
C.config = {
  base: ''
};
C.history = History;
C.router = (function() {
  /**
   * Base path.
   */
  var base = C.config.base || '';

  /**
   * Previous context, for capturing
   * router exit events.
   */
  var prevContext;

  var pathtoRegexp = (function() {
    var isArray = Array.isArray || function(arr) {
      return Object.prototype.toString.call(arr) == '[object Array]';
    };

    /**
     * The main path matching regexp utility.
     *
     * @type {RegExp}
     */
    var PATH_REGEXP = new RegExp([
      '(\\\\.)',
      '([\\/.])?(?:\\:(\\w+)(?:\\(((?:\\\\.|[^)])*)\\))?|\\(((?:\\\\.|[^)])*)\\))([+*?])?',
      '([.+*?=^!:${}()[\\]|\\/])'
    ].join('|'), 'g');

    /**
     * Escape the capturing group by escaping special characters and meaning.
     *
     * @param  {String} group
     * @return {String}
     */
    function escapeGroup(group) {
      return group.replace(/([=!:$\/()])/g, '\\$1');
    }

    /**
     * Attach the keys as a property of the regexp.
     *
     * @param  {RegExp} re
     * @param  {Array}  keys
     * @return {RegExp}
     */
    function attachKeys(re, keys) {
      re.keys = keys;
      return re;
    }

    /**
     * Get the flags for a regexp from the options.
     *
     * @param  {Object} options
     * @return {String}
     */
    function flags(options) {
      return options.sensitive ? '' : 'i';
    }

    /**
     * Pull out keys from a regexp.
     *
     * @param  {RegExp} path
     * @param  {Array}  keys
     * @return {RegExp}
     */
    function regexpToRegexp(path, keys) {
      // Use a negative lookahead to match only capturing groups.
      var groups = path.source.match(/\((?!\?)/g);

      if (groups) {
        for (var i = 0; i < groups.length; i++) {
          keys.push({
            name: i,
            delimiter: null,
            optional: false,
            repeat: false
          });
        }
      }

      return attachKeys(path, keys);
    }

    /**
     * Transform an array into a regexp.
     *
     * @param  {Array}  path
     * @param  {Array}  keys
     * @param  {Object} options
     * @return {RegExp}
     */
    function arrayToRegexp(path, keys, options) {
      var parts = [];

      for (var i = 0; i < path.length; i++) {
        parts.push(pathToRegexp(path[i], keys, options).source);
      }

      var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options));
      return attachKeys(regexp, keys);
    }

    /**
     * Replace the specific tags with regexp strings.
     *
     * @param  {String} path
     * @param  {Array}  keys
     * @return {String}
     */
    function replacePath(path, keys) {
      var index = 0;

      function replace(_, escaped, prefix, key, capture, group, suffix, escape) {
        if (escaped) {
          return escaped;
        }

        if (escape) {
          return '\\' + escape;
        }

        var repeat = suffix === '+' || suffix === '*';
        var optional = suffix === '?' || suffix === '*';

        keys.push({
          name: key || index++,
          delimiter: prefix || '/',
          optional: optional,
          repeat: repeat
        });

        prefix = prefix ? ('\\' + prefix) : '';
        capture = escapeGroup(capture || group || '[^' + (prefix || '\\/') + ']+?');

        if (repeat) {
          capture = capture + '(?:' + prefix + capture + ')*';
        }

        if (optional) {
          return '(?:' + prefix + '(' + capture + '))?';
        }

        // Basic parameter support.
        return prefix + '(' + capture + ')';
      }

      return path.replace(PATH_REGEXP, replace);
    }

    /**
     * Normalize the given path string, returning a regular expression.
     *
     * An empty array can be passed in for the keys, which will hold the
     * placeholder key descriptions. For example, using `/user/:id`, `keys` will
     * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
     *
     * @param  {(String|RegExp|Array)} path
     * @param  {Array}                 [keys]
     * @param  {Object}                [options]
     * @return {RegExp}
     */
    function pathToRegexp(path, keys, options) {
      keys = keys || [];

      if (!isArray(keys)) {
        options = keys;
        keys = [];
      } else if (!options) {
        options = {};
      }

      if (path instanceof RegExp) {
        return regexpToRegexp(path, keys, options);
      }

      if (isArray(path)) {
        return arrayToRegexp(path, keys, options);
      }

      var strict = options.strict;
      var end = options.end !== false;
      var route = replacePath(path, keys);
      var endsWithSlash = path.charAt(path.length - 1) === '/';

      // In non-strict mode we allow a slash at the end of match. If the path to
      // match already ends with a slash, we remove it for consistency. The slash
      // is valid at the end of a path match, not in the middle. This is important
      // in non-ending mode, where "/test/" shouldn't match "/test//route".
      if (!strict) {
        route = (endsWithSlash ? route.slice(0, -2) : route) + '(?:\\/(?=$))?';
      }

      if (end) {
        route += '$';
      } else {
        // In non-ending mode, we need the capturing groups to match as much as
        // possible by using a positive lookahead to the end or next path segment.
        route += strict && endsWithSlash ? '' : '(?=\\/|$)';
      }

      return attachKeys(new RegExp('^' + route, flags(options)), keys);
    }

    return pathToRegexp;
  })();

  var qs = (function() {
    /**
     * Object#toString() ref for stringify().
     */
    var toString = Object.prototype.toString;

    /**
     * Cache non-integer test regexp.
     */
    var isint = /^[0-9]+$/;

    function promote(parent, key) {
      if (parent[key].length == 0) return parent[key] = {};
      var t = {};
      for (var i in parent[key]) t[i] = parent[key][i];
      parent[key] = t;
      return t;
    }

    function parse(parts, parent, key, val) {
      var part = parts.shift();
      // end
      if (!part) {
        if (Array.isArray(parent[key])) {
          parent[key].push(val);
        } else if ('object' == typeof parent[key]) {
          parent[key] = val;
        } else if ('undefined' == typeof parent[key]) {
          parent[key] = val;
        } else {
          parent[key] = [parent[key], val];
        }
        // array
      } else {
        var obj = parent[key] = parent[key] || [];
        if (']' == part) {
          if (Array.isArray(obj)) {
            if ('' != val) obj.push(val);
          } else if ('object' == typeof obj) {
            obj[Object.keys(obj).length] = val;
          } else {
            obj = parent[key] = [parent[key], val];
          }
          // prop
        } else if (~part.indexOf(']')) {
          part = part.substr(0, part.length - 1);
          if (!isint.test(part) && Array.isArray(obj)) obj = promote(parent, key);
          parse(parts, obj, part, val);
          // key
        } else {
          if (!isint.test(part) && Array.isArray(obj)) obj = promote(parent, key);
          parse(parts, obj, part, val);
        }
      }
    }

    /**
     * Merge parent key/val pair.
     */

    function merge(parent, key, val) {
      if (~key.indexOf(']')) {
        var parts = key.split('['),
          len = parts.length,
          last = len - 1;
        parse(parts, parent, 'base', val);
        // optimize
      } else {
        if (!isint.test(key) && Array.isArray(parent.base)) {
          var t = {};
          for (var k in parent.base) t[k] = parent.base[k];
          parent.base = t;
        }
        set(parent.base, key, val);
      }

      return parent;
    }

    /**
     * Parse the given obj.
     */

    function parseObject(obj) {
      var ret = {
        base: {}
      };
      Object.keys(obj).forEach(function(name) {
        merge(ret, name, obj[name]);
      });
      return ret.base;
    }

    /**
     * Parse the given str.
     */

    function parseString(str) {
      return String(str)
        .split('&')
        .reduce(function(ret, pair) {
          try {
            pair = decodeURIComponent(pair.replace(/\+/g, ' '));
          } catch (e) {
            // ignore
          }

          var eql = pair.indexOf('='),
            brace = lastBraceInKey(pair),
            key = pair.substr(0, brace || eql),
            val = pair.substr(brace || eql, pair.length),
            val = val.substr(val.indexOf('=') + 1, val.length);

          // ?foo
          if ('' == key) key = pair, val = '';

          return merge(ret, key, val);
        }, {
          base: {}
        }).base;
    }


    /**
     * Turn the given `obj` into a query string
     *
     * @param {Object} obj
     * @return {String}
     * @api public
     */

    function stringify(obj, prefix) {
      if (Array.isArray(obj)) {
        return stringifyArray(obj, prefix);
      } else if ('[object Object]' == toString.call(obj)) {
        return stringifyObject(obj, prefix);
      } else if ('string' == typeof obj) {
        return stringifyString(obj, prefix);
      } else {
        return prefix + '=' + obj;
      }
    };

    /**
     * Stringify the given `str`.
     *
     * @param {String} str
     * @param {String} prefix
     * @return {String}
     * @api private
     */

    function stringifyString(str, prefix) {
      if (!prefix) throw new TypeError('stringify expects an object');
      return prefix + '=' + encodeURIComponent(str);
    }

    /**
     * Stringify the given `arr`.
     *
     * @param {Array} arr
     * @param {String} prefix
     * @return {String}
     * @api private
     */

    function stringifyArray(arr, prefix) {
      var ret = [];
      if (!prefix) throw new TypeError('stringify expects an object');
      for (var i = 0; i < arr.length; i++) {
        ret.push(stringify(arr[i], prefix + '[' + i + ']'));
      }
      return ret.join('&');
    }

    /**
     * Stringify the given `obj`.
     *
     * @param {Object} obj
     * @param {String} prefix
     * @return {String}
     * @api private
     */

    function stringifyObject(obj, prefix) {
      var ret = [],
        keys = Object.keys(obj),
        key;

      for (var i = 0, len = keys.length; i < len; ++i) {
        key = keys[i];
        ret.push(stringify(obj[key], prefix ? prefix + '[' + encodeURIComponent(key) + ']' : encodeURIComponent(key)));
      }

      return ret.join('&');
    }

    /**
     * Set `obj`'s `key` to `val` respecting
     * the weird and wonderful syntax of a qs,
     * where "foo=bar&foo=baz" becomes an array.
     *
     * @param {Object} obj
     * @param {String} key
     * @param {String} val
     * @api private
     */

    function set(obj, key, val) {
      var v = obj[key];
      if (undefined === v) {
        obj[key] = val;
      } else if (Array.isArray(v)) {
        v.push(val);
      } else {
        obj[key] = [v, val];
      }
    }

    /**
     * Locate last brace in `str` within the key.
     *
     * @param {String} str
     * @return {Number}
     * @api private
     */

    function lastBraceInKey(str) {
      var len = str.length,
        brace, c;
      for (var i = 0; i < len; ++i) {
        c = str[i];
        if (']' == c) brace = false;
        if ('[' == c) brace = true;
        if ('=' == c && !brace) return i;
      }
    }

    return {
      /**
       * Parse the given query `str` or `obj`, returning an object.
       *
       * @param {String} str | {Object} obj
       * @return {Object}
       * @api public
       */
      parse: function(str) {
        if (null == str || '' == str) return {};
        return 'object' == typeof str ? parseObject(str) : parseString(str);
      },
      stringify: stringify
    };
  })();

  /**
   * Register `path` with callback `fn()`,
   * or route `path`, or redirection,
   *
   *   FJ.router('*', fn);
   *   FJ.router('/user/:id', load, user);
   *
   * @param {String} path
   * @param {Function} fn...
   * @api public
   */
  function Router(path, fn) {
    var route = new Route(path);
    for (var i = 1; i < arguments.length; ++i) {
      Router.callbacks.push(route.middleware(arguments[i]));
    }
  }

  /**
   * Callback functions.
   */
  Router.callbacks = [];
  Router.exits = [];
  Router.errors = [];

  /**
   * Show timestamp
   * @type {String}
   */
  Router.timestamp = 0;

  /**
   * Register an exit route on `path` with
   * callback `fn()`, which will be called
   * on the previous context when a new
   * Router is visited.
   */
  Router.exit = function(path, fn) {
    var route = new Route(path);
    for (var i = 1; i < arguments.length; ++i) {
      Router.exits.push(route.middleware(arguments[i]));
    }
  };

  /**
   * Register route to redirect from one path to other
   * or just redirect to another route
   *
   * @param {String} from - if param 'to' is undefined redirects to 'from'
   * @param {String} [to]
   * @api public
   */
  Router.redirect = function(from, to) {
    // Define route from a path to another
    if ('string' === typeof from && 'string' === typeof to) {
      Router(from, function(e) {
        setTimeout(function() {
          C.history.replaceState(null, null, to);
        }, 0);
      });
    }
    // Wait for the push state and replace it with another
    if ('string' === typeof from && 'undefined' === typeof to) {
      setTimeout(function() {
        C.history.replaceState(null, null, from);
      }, 0);
    }
  };

  /**
   * Register global error function
   * callback `fn()`, which will be called
   * on the previous context when Router is error
   */
  Router.error = function(fn) {
    for (var i = 0; i < arguments.length; ++i) {
      Router.errors.push(arguments[i]);
    }
  };

  /**
   * Show `path` with optional `state` object.
   *
   * @param {String} path
   * @param {Object} state
   * @param {Boolean} dispatch
   * @return {Context}
   * @api public
   */
  Router.show = function(path) {
    var timestamp = +new Date;
    var referer = prevContext ? prevContext.canonicalPath : '';
    var ctx = new Context(path, referer, timestamp);
    Router.timestamp = timestamp;
    Router.dispatch(ctx);
    return ctx;
  };

  /**
   * Dispatch the given `ctx`.
   *
   * @param {Object} ctx
   * @api private
   */
  Router.dispatch = function(ctx) {
    var prev = prevContext,
        i = 0,
        j = 0;
    prevContext = ctx;

    function nextExit() {
      var fn = Router.exits[j++];
      if (!fn) return nextEnter();
      fn(prev, nextExit);
    }

    function nextEnter() {
      var fn = Router.callbacks[i++];
      if (ctx.timestamp !== Router.timestamp) {
        return;
      }
      if (!fn) return unhandled(ctx);
      fn(ctx, nextEnter);
    }

    if (prev) {
      nextExit();
    } else {
      nextEnter();
    }
  };

  /**
   * Unhandled `ctx`. When all of callbaks were not
   * match the path. If you wish to handle this error
   * on the app global.
   *
   * @param {Context} ctx
   * @api private
   */
  function unhandled(ctx) {
    var i = 0;
    function next() {
      var fn = Router.errors[i++];
      if (fn) return fn(prevContext, next);
    }
    next();
  }

  /**
   * Remove URL encoding from the given `str`.
   * Accommodates whitespace in both x-www-form-urlencoded
   * and regular percent-encoded form.
   *
   * @param {str} URL component to decode
   */
  function decodeURLEncodedURIComponent(val) {
    if (typeof val !== 'string') {
      return val;
    }
    return decodeURIComponent(val.replace(/\+/g, ' '));
  }

  /**
   * Initialize `Route` with the given HTTP `path`,
   * and an array of `callbacks` and `options`.
   *
   * Options:
   *
   *   - `sensitive`    enable case-sensitive routes
   *   - `strict`       enable strict matching for trailing slashes
   *
   * @param {String} path
   * @param {Object} options.
   * @api private
   */
  function Route(path, options) {
    options = options || {};
    this.path = (path === '*') ? '(.*)' : path;
    this.method = 'GET';
    this.regexp = pathtoRegexp(this.path,
      this.keys = [],
      options.sensitive,
      options.strict);
  }

  /**
   * Return route middleware with
   * the given callback `fn()`.
   *
   * @param {Function} fn
   * @return {Function}
   * @api public
   */
  Route.prototype.middleware = function(fn) {
    var self = this;
    return function(ctx, next) {
      if (self.match(ctx.path, ctx.params)) return fn(ctx, next);
      next();
    };
  };

  /**
   * Check if this route matches `path`, if so
   * populate `params`.
   *
   * @param {String} path
   * @param {Object} params
   * @return {Boolean}
   * @api private
   */
  Route.prototype.match = function(path, params) {
    var keys = this.keys,
        qsIndex = path.indexOf('?'),
        pathname = ~qsIndex ? path.slice(0, qsIndex) : path,
        m = this.regexp.exec(decodeURIComponent(pathname));

    if (!m) return false;
    for (var i = 1, len = m.length; i < len; ++i) {
      var key = keys[i - 1];
      var val = decodeURLEncodedURIComponent(m[i]);
      if (val !== undefined || !(hasOwnProperty.call(params, key.name))) {
        params[key.name] = val;
      }
    }

    return true;
  };

  /**
   * Initialize a new "request" `Context`
   * with the given `path` and optional initial `state`.
   *
   * @param {String} path
   * @param {String} referer
   * @param {Number} timestamp
   * @api public
   */
  function Context(path, referer, timestamp) {
    var path = base + path;
    var parts = path.split('#');
    var part = parts[0];
    var i = part.indexOf('?');
    var self = this;

    this.canonicalPath = path;
    this.path = parts[0].replace(base, '') || '/';
    this.hash = parts[1] || '';


    this.pathname = decodeURLEncodedURIComponent(~i ? part.slice(0, i) : part);
    this.querystring = ~i ? decodeURLEncodedURIComponent(part.slice(i + 1)) : '';
    this.params = {};

    this.referer = referer;
    this.timestamp = timestamp;
  }

  Context.prototype.query = function(querystring) {
    return qs.parse(querystring || this.querystring);
  };
  return Router;
})();
C.page = {
  go: function(link, title) {
    C.history.pushState(null, title || null, link);
  },
  redirect: function(link) {
    C.router.redirect(link);
  },
  show: function(link) {
    C.router.show(link);
  }
}
C.bind = function() {
  var _path = '';
  // Bind event to URL change.
  C.history.Adapter.bind(window, 'statechange', function() {
    var State = C.history.getState();
    _path = State.hash;
    C.page.show(_path);
  });

  // Attach event on "A".
  $(document).on('click', 'a', function(ent) {
    var $target = $(this);

    if (1 !== ent.which) return;
    if (ent.metaKey || ent.ctrlKey || ent.shiftKey) return;
    if (ent.isDefaultPrevented()) return;

    if ($target.attr('target')) return;

    var link = $target.attr('href');
    if (!/^\/.*$/i.test(link)) return;

    ent.preventDefault();

    _path = link;
    link = link.split('#')[0];

    C.page.go(link);
  });
};
C.init = function(option) {
  var URL = window.location.href;
  var path = URL.replace(/^http(s?):\/\/[^\/]*/, '');
  if (/^\/#!\//.test(path)) {
    path = path.slice(3);
  }
  C.bind();
  C.page.show(path);
};
module.exports = C;