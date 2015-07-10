(function() {

  'use strict';

  angular.module('mindsmash.hotkeys', []).provider('hotkeys', function() {

    this.$get = function ($rootElement, $rootScope, $compile, $window, $document) {

      // monkeypatch Mousetrap's stopCallback() function
      // this version doesn't return true when the element is an INPUT, SELECT, or TEXTAREA
      // (instead we will perform this check per-key in the _add() method)
      Mousetrap.stopCallback = function(event, element) {
        // if the element has the class "mousetrap" then no need to stop
        if ((' ' + element.className + ' ').indexOf(' mousetrap ') > -1) {
          return false;
        }

        return (element.contentEditable && element.contentEditable == 'true');
      };

      /**
       * Convert strings like cmd into symbols like ⌘
       * @param  {String} combo Key combination, e.g. 'mod+f'
       * @return {String}       The key combination with symbols
       */
      function symbolize (combo) {
        var map = {
          command   : '⌘',
          shift     : '⇧',
          left      : '←',
          right     : '→',
          up        : '↑',
          down      : '↓',
          'return'  : '↩',
          backspace : '⌫'
        };
        combo = combo.split('+');

        for (var i = 0; i < combo.length; i++) {
          // try to resolve command / ctrl based on OS:
          if (combo[i] === 'mod') {
            if ($window.navigator && $window.navigator.platform.indexOf('Mac') >=0 ) {
              combo[i] = 'command';
            } else {
              combo[i] = 'ctrl';
            }
          }

          combo[i] = map[combo[i]] || combo[i];
        }

        return combo.join(' + ');
      }

      /**
       * Hotkey object used internally for consistency
       *
       * @param {array}    combo       The keycombo. it's an array to support multiple combos
       * @param {String}   description Description for the keycombo
       * @param {Function} callback    function to execute when keycombo pressed
       * @param {string}   action      the type of event to listen for (for mousetrap)
       * @param {array}    allowIn     an array of tag names to allow this combo in ('INPUT', 'SELECT', and/or 'TEXTAREA')
       * @param {Boolean}  persistent  Whether the hotkey persists navigation events
       */
      function Hotkey (combo, description, callback, action, allowIn, persistent) {
        // TODO: Check that the values are sane because we could
        // be trying to instantiate a new Hotkey with outside dev's
        // supplied values

        this.combo = combo instanceof Array ? combo : [combo];
        this.description = description;
        this.callback = callback;
        this.action = action;
        this.allowIn = allowIn;
        this.persistent = persistent;
      }

      /**
       * Helper method to format (symbolize) the key combo for display
       *
       * @return {[Array]} An array of the key combination sequence
       *   for example: "command+g c i" becomes ["⌘ + g", "c", "i"]
       *
       * TODO: this gets called a lot.  We should cache the result
       */
      Hotkey.prototype.format = function() {

        // Don't show all the possible key combos, just the first one.  Not sure
        // of usecase here, so open a ticket if my assumptions are wrong
        var combo = this.combo[0];

        var sequence = combo.split(/[\s]/);
        for (var i = 0; i < sequence.length; i++) {
          sequence[i] = symbolize(sequence[i]);
        }

        return sequence;
      };

      /**
       * Holds an array of Hotkey objects currently bound
       * @type {Array}
       */
      var hotkeys = [];

      /**
       * Holds references to the different scopes that have bound hotkeys
       * attached.  This is useful to catch when the scopes are `$destroy`d and
       * then automatically unbind the hotkey.
       *
       * @type {Array}
       */
      var boundScopes = [];


      $rootScope.$on('$routeChangeSuccess', function (event, route) {
        purgeHotkeys();

        if (route && route.hotkeys) {
          angular.forEach(route.hotkeys, function (hotkey) {
            // a string was given, which implies this is a function that is to be
            // $eval()'d within that controller's scope
            // TODO: hotkey here is super confusing.  sometimes a function (that gets turned into an array), sometimes a string
            var callback = hotkey[2];
            if (typeof(callback) === 'string' || callback instanceof String) {
              hotkey[2] = [callback, route];
            }

            // todo: perform check to make sure not already defined:
            // this came from a route, so it's likely not meant to be persistent
            hotkey[5] = false;
            _add.apply(this, hotkey);
          });
        }
      });


      /**
       * Purges all non-persistent hotkeys (such as those defined in routes)
       *
       * Without this, the same hotkey would get recreated everytime
       * the route is accessed.
       */
      function purgeHotkeys() {
        var i = hotkeys.length;
        while (i--) {
          var hotkey = hotkeys[i];
          if (hotkey && !hotkey.persistent) {
            _del(hotkey);
          }
        }
      }

      /**
       * Creates a new Hotkey and creates the Mousetrap binding
       *
       * @param {string}   combo       mousetrap key binding
       * @param {string}   description description for the help menu
       * @param {Function} callback    method to call when key is pressed
       * @param {string}   action      the type of event to listen for (for mousetrap)
       * @param {array}    allowIn     an array of tag names to allow this combo in ('INPUT', 'SELECT', and/or 'TEXTAREA')
       * @param {boolean}  persistent  if true, the binding is preserved upon route changes
       */
      function _add (combo, description, callback, action, allowIn, persistent) {

        // used to save original callback for "allowIn" wrapping:
        var _callback;

        // these elements are prevented by the default Mousetrap.stopCallback():
        var preventIn = ['INPUT', 'SELECT', 'TEXTAREA'];

        // Determine if object format was given:
        var objType = Object.prototype.toString.call(combo);

        if (objType === '[object Object]') {
          description = combo.description;
          callback    = combo.callback;
          action      = combo.action;
          persistent  = combo.persistent;
          allowIn     = combo.allowIn;
          combo       = combo.combo;
        }

        // description is optional:
        if (description instanceof Function) {
          action = callback;
          callback = description;
          description = '$$undefined$$';
        } else if (angular.isUndefined(description)) {
          description = '$$undefined$$';
        }

        // any items added through the public API are for controllers
        // that persist through navigation, and thus undefined should mean
        // true in this case.
        if (persistent === undefined) {
          persistent = true;
        }

        // if callback is defined, then wrap it in a function
        // that checks if the event originated from a form element.
        // the function blocks the callback from executing unless the element is specified
        // in allowIn (emulates Mousetrap.stopCallback() on a per-key level)
        if (typeof callback === 'function') {

          // save the original callback
          _callback = callback;

          // make sure allowIn is an array
          if (!(allowIn instanceof Array)) {
            allowIn = [];
          }

          // remove anything from preventIn that's present in allowIn
          var index;
          for (var i=0; i < allowIn.length; i++) {
            allowIn[i] = allowIn[i].toUpperCase();
            index = preventIn.indexOf(allowIn[i]);
            if (index !== -1) {
              preventIn.splice(index, 1);
            }
          }

          // create the new wrapper callback
          callback = function(event) {
            var shouldExecute = true;
            var target = event.target || event.srcElement; // srcElement is IE only
            var nodeName = target.nodeName.toUpperCase();

            // check if the input has a mousetrap class, and skip checking preventIn if so
            if ((' ' + target.className + ' ').indexOf(' mousetrap ') > -1) {
              shouldExecute = true;
            } else {
              // don't execute callback if the event was fired from inside an element listed in preventIn
              for (var i=0; i<preventIn.length; i++) {
                if (preventIn[i] === nodeName) {
                  shouldExecute = false;
                  break;
                }
              }
            }

            if (shouldExecute) {
              wrapApply(_callback.apply(this, arguments));
            }
          };
        }

        if (typeof(action) === 'string') {
          Mousetrap.bind(combo, wrapApply(callback), action);
        } else {
          Mousetrap.bind(combo, wrapApply(callback));
        }

        var hotkey = new Hotkey(combo, description, callback, action, allowIn, persistent);
        hotkeys.push(hotkey);
        return hotkey;
      }

      /**
       * delete and unbind a Hotkey
       *
       * @param  {mixed} hotkey   Either the bound key or an instance of Hotkey
       * @return {boolean}        true if successful
       */
      function _del (hotkey) {
        var combo = (hotkey instanceof Hotkey) ? hotkey.combo : hotkey;

        Mousetrap.unbind(combo);

        if (angular.isArray(combo)) {
          var retStatus = true;
          var i = combo.length;
          while (i--) {
            retStatus = _del(combo[i]) && retStatus;
          }
          return retStatus;
        } else {
          var index = hotkeys.indexOf(_get(combo));

          if (index > -1) {
            // if the combo has other combos bound, don't unbind the whole thing, just the one combo:
            if (hotkeys[index].combo.length > 1) {
              hotkeys[index].combo.splice(hotkeys[index].combo.indexOf(combo), 1);
            } else {
              hotkeys.splice(index, 1);
            }
            return true;
          }
        }

        return false;

      }

      /**
       * Get a Hotkey object by key binding
       *
       * @param  {[string]} combo  the key the Hotkey is bound to
       * @return {Hotkey}          The Hotkey object
       */
      function _get (combo) {

        var hotkey;

        for (var i = 0; i < hotkeys.length; i++) {
          hotkey = hotkeys[i];

          if (hotkey.combo.indexOf(combo) > -1) {
            return hotkey;
          }
        }

        return false;
      }

      /**
       * Binds the hotkey to a particular scope.  Useful if the scope is
       * destroyed, we can automatically destroy the hotkey binding.
       *
       * @param  {Object} scope The scope to bind to
       */
      function bindTo (scope) {
        // Only initialize once to allow multiple calls for same scope.
        if (!(scope.$id in boundScopes)) {

          // Add the scope to the list of bound scopes
          boundScopes[scope.$id] = [];

          scope.$on('$destroy', function () {
            var i = boundScopes[scope.$id].length;
            while (i--) {
              _del(boundScopes[scope.$id][i]);
              delete boundScopes[scope.$id][i];
            }
          });
        }
        // return an object with an add function so we can keep track of the
        // hotkeys and their scope that we added via this chaining method
        return {
          add: function (args) {
            var hotkey;

            if (arguments.length > 1) {
              hotkey = _add.apply(this, arguments);
            } else {
              hotkey = _add(args);
            }

            boundScopes[scope.$id].push(hotkey);
            return this;
          }
        };
      }

      /**
       * All callbacks sent to Mousetrap are wrapped using this function
       * so that we can force a $scope.$apply()
       *
       * @param  {Function} callback [description]
       * @return {[type]}            [description]
       */
      function wrapApply (callback) {
        // return mousetrap a function to call
        return function (event, combo) {

          // if this is an array, it means we provided a route object
          // because the scope wasn't available yet, so rewrap the callback
          // now that the scope is available:
          if (callback instanceof Array) {
            var funcString = callback[0];
            var route = callback[1];
            callback = function (event) {
              route.scope.$eval(funcString);
            };
          }

          // this takes place outside angular, so we'll have to call
          // $apply() to make sure angular's digest happens
          $rootScope.$apply(function() {
            // call the original hotkey callback with the keyboard event
            callback(event, _get(combo));
          });
        };
      }


      var publicApi = {
        add                   : _add,
        del                   : _del,
        get                   : _get,
        bindTo                : bindTo,
        purgeHotkeys          : purgeHotkeys
      };

      return publicApi;

    };
  })

  .directive('hotkey', function (hotkeys) {
    return {
      restrict: 'A',
      link: function (scope, el, attrs) {
        var key, allowIn;

        angular.forEach(scope.$eval(attrs.hotkey), function (func, hotkey) {
          // split and trim the hotkeys string into array
          allowIn = typeof attrs.hotkeyAllowIn === "string" ? attrs.hotkeyAllowIn.split(/[\s,]+/) : [];

          key = hotkey;

          hotkeys.add({
            combo: hotkey,
            description: attrs.hotkeyDescription,
            callback: func,
            action: attrs.hotkeyAction,
            allowIn: allowIn
          });
        });

        // remove the hotkey if the directive is destroyed:
        el.bind('$destroy', function() {
          hotkeys.del(key);
        });
      }
    };
  })

	/**
	 * Allow 'hotkey' attribute for ui-router states.
	 */
	.run(function(hotkeys, $injector){
		
		// execute only if $state can be injected
		try {
			$injector.invoke(function($state, $q) {
				function addHotkey(state, hotkey) {
					if(!angular.isObject(hotkey)) {
						hotkey = { combo: hotkey };
					}
					
					hotkey.callback = function() {
						$state.go(state.name);
					};
					
					hotkeys.add(hotkey);
				}
				
				angular.forEach($state.get(), function(state){
					if(state.hotkey) {
						if(angular.isFunction(state.hotkey)) {
							$q.when($injector.invoke(state.hotkey)).then(function(hotkeyObject){
								addHotkey(state, hotkeyObject);
							});
						} else {
							addHotkey(state, state.hotkey);
						}
					}
				});
			});
		} catch(ignored) {
			console.debug('mindsmash.hotkeys: ui-router seems to be absent');
		}
	});
})();
