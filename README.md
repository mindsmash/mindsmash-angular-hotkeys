# mindsmash-angular-hotkeys
Hotkey library for AngularJS. 

### Features:
- Define hotkeys on an entire route (ngRoute or ui-router), automatically binding and unbinding them as you navigate
- Directive hotkey binding

### Installation:

#### via bower:

```
$ bower install mindsmash-angular-hotkeys --save
```

*please use either the minified or unminified file in the `dist` directory*

### Usage:

You can either define hotkeys in your Controller, or in your Route configuration (or both).  To start, though, require the lib as a dependency for your angular app:

```js
angular.module('myApp', ['ngRoute', 'mindsmash.hotkeys']);
```

#### Binding hotkeys in controllers:
It is important to note that by default, hotkeys bound using the `hotkeys.add()`
method are persistent, meaning they will continue to exist through route
changes, DOM manipulation, or anything else.

However, it is possible to bind the hotkey to a particular scope, and when that
scope is destroyed, the hotkey is automatically removed. This should be
considered the best practice when binding hotkeys from a controller. For this
usage example, see the `hotkeys.bindTo()` method below:

```js
angular.module('myApp').controller('NavbarCtrl', function($scope, hotkeys) {
  $scope.volume = 5;

  // You can pass it an object.  This hotkey will not be unbound unless manually removed
  // using the hotkeys.del() method
  hotkeys.add({
    combo: 'ctrl+up',
    description: 'This one goes to 11',
    callback: function() {
      $scope.volume += 1;
    }
  });

  // when you bind it to the controller's scope, it will automatically unbind
  // the hotkey when the scope is destroyed (due to ng-if or something that changes the DOM)
  hotkeys.bindTo($scope)
    .add({
      combo: 'w',
      description: 'blah blah',
      callback: function() {}
    })
    // you can chain these methods for ease of use:
    .add ({...});

});
```

#### Binding hotkeys in routes:
You can also define hotkeys on an entire route, and this lib will bind and unbind them as you navigate the app.

```js
angular.module('myApp').config(function ($routeProvider) {
  $routeProvider.when('/', {
    controller: 'RestaurantsController',
    templateUrl: 'views/restaurants.html',
    hotkeys: [
      ['p', 'Sort by price', 'sort(price)']
    ]
  });
});
```

```js
angular.module('myApp').config(function ($stateProvider) {
  $stateProvider.state('myState', {
    url: '/myState',
    hotkey: { combo:'s', description:'Some shortcut description' }
  })
});
```

#### Binding hotkeys in directives:
Lastly, even though binding hotkeys in your templates/html tends to be a bad idea, it can be super useful for simple shortcuts.  Think along the lines of a modal directive where you simply want to bind to the escape key or something equally simple.  Accomplishing this within a controller is too much overhead, and it may lead to code-reuse.

Example of how directive-based hotkeys works:

```html
<modal title="Modal Title" hotkey="{esc: close}">
```

### Configuration

**Disable ngRoute integration:**

To prevent listening for $routeChangeSuccess events use `hotkeysProvider`.
This option defaults to false if ngRoute module is not loaded:

```js
angular.module('myApp', ['cfp.hotkeys'])
  .config(function(hotkeysProvider) {
    hotkeysProvider.useNgRoute = false;
  })
```

### API

#### hotkeys.add(object)
`object`: An object with the following parameters:
- `combo`: They keyboard combo (shortcut) you want to bind to
- `description`: [OPTIONAL] The description for what the combo does and is only used for the Cheat Sheet.  If it is not supplied, it will not show up, and in effect, allows you to have unlisted hotkeys.
- `callback`: The function to execute when the key(s) are pressed.  Passes along two arguments, `event` and `hotkey`
- `action`: [OPTIONAL] The type of event to listen for, such as `keypress`, `keydown` or `keyup`. Usage of this parameter is discouraged as the underlying library will pick the most suitable option automatically. This should only be necessary in advanced situations.
- `allowIn`: [OPTIONAL] an array of tag names to allow this combo in ('INPUT', 'SELECT', and/or 'TEXTAREA')

```js
hotkeys.add({
  combo: 'ctrl+w',
  description: 'Description goes here',
  callback: function(event, hotkey) {
    event.preventDefault();
  }
});

// this hotkey will not show up on the cheat sheet:
hotkeys.add({
  combo: 'ctrl+x',
  callback: function(event, hotkey) {...}
});
```

#### hotkeys.get(key)
Returns the Hotkey object

```js
hotkeys.get('ctrl+w');
// -> Hotkey { combo: ['ctrl+w'], description: 'Description goes here', callback: function (event, hotkey) }
```

#### hotkeys.del(key)
Removes and unbinds a hotkey

```js
hotkeys.del('ctrl+w');
```

### Allowing hotkeys in form elements
By default, Mousetrap prevents hotkey callbacks from firing when their event originates from an `input`, `select`, or `textarea` element. To enable hotkeys in these elements, specify them in the `allowIn` parameter:
```js
hotkeys.add({
  combo: 'ctrl+w',
  description: 'Description goes here',
  allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
  callback: function(event, hotkey) {
    event.preventDefault();
  }
});
```

## Credits:

This is a fork of [chieffancypants/angular-hotkeys](https://github.com/chieffancypants/angular-hotkeys). 
