(function (global) {
'use strict';

var BRUSH_WIDTH = 12;
var TOUCH_DEVICE = 'ontouchstart' in global || 'onmsgesturechange' in global;

(function setupController () {
  var body;
  var input;
  var channel;
  var viewport;
  var controls;

  body = document.body;

  function stateHandler (connected, reason) {
    body.className = connected ? 'online' : 'offline';
    input.enabled = connected;
  }

  function dataHandler (data) {
    if ('c' in data == false) {
      data.c = controls.color;
      channel.send(data);
    }
    viewport.draw(data);
  }

  function startMoveHandler () {
    body.className = 'painting online';
  }

  function stopMoveHandler () {
    body.className = 'online';
  }

  channel = new PaintChannel(window.APP_URL || 'emitter.io');
  controls = new PaintControls(document.getElementById('menu'));
  viewport = new CanvasViewport(document.getElementById('canvas'));
  input = TOUCH_DEVICE ? new TouchInterface(document.getElementById('canvas'))
                       : new PointerInterface(document.getElementById('canvas'));

  input.ondata = dataHandler;
  input.onstartmove = startMoveHandler;
  input.onstopmove = stopMoveHandler;
  channel.ondata = dataHandler;
  channel.onstate = stateHandler;
}());

function PaintChannel (url) {
  var self = this;
  var connected = false;
  var hash = '';
  var userid;

  this.userId = null;
  this.userCount = 0;
  this.topic = "JOprXrilHQi-Cgm34BUPqN8hi6W4kUDz/paint/";
  this.client = new Paho.MQTT.Client("api.emitter.io", 8080, "paint-client");
  this.client.onMessageArrived = onMessage;
  
  // called when a message arrives
  function onMessage(m) {
    try {
      // Get the payload and parse it
      self.ondata(
        JSON.parse(m.payloadString)
        );
    } catch (encodingError) { console.error(encodingError); }
  }

  this.send = function (data) {
      data.id = self.userId;
      var message = new Paho.MQTT.Message(JSON.stringify(data));
      message.destinationName = self.topic;
      self.client.send(message)
  };;

  if (location.hash && location.hash.length > 1) {
    hash = '/' + location.hash.substr(1);
  }

  (function setup () {
    self.client.connect({onSuccess: function(){
      connected = true;
      self.onstate(connected);
      self.client.subscribe(self.topic);
    }});
  }());
}

function TouchInterface (target) {
  var self = this;
  var moves = null;

  this.enabled = false;

  function translate (t) {
    var target = t.target;
    return { 
      x: (t.pageX - (target.parentNode.offsetLeft + target.parentNode.offsetTop)) * (target.width / target.clientWidth),
      y: (t.pageY - target.parentNode.offsetTop) * (target.height / target.clientHeight) 
    };
  }

  document.addEventListener('touchstart', function (event) {
    if (!event.target.control) {
      event.preventDefault();
    }
  });

  // Fix issue with iOS devices and orientation change
  window.addEventListener('orientationchange', function() {
    window.scrollTo(0, 0);
  });

  target.addEventListener('touchstart', function (event) {
    var touch;

    if (self.enabled == false) {
      return;
    }

    self.onstartmove();
    event.preventDefault();
    moves = moves || {};
    
    for (var i = 0; i < event.changedTouches.length; i++) {
      touch = event.changedTouches[i];
      console.log(translate(touch));
      moves[touch.identifier] = translate(touch);
    }
  });

  target.addEventListener('touchmove', function (event) {
    var touch;
    var move;
    var pos;

    if (!moves || self.enabled == false) {
      return;
    }

    event.preventDefault();

    for (var i = 0; i < event.changedTouches.length; i++) {
      touch = event.changedTouches[i];

      if (!(move = moves[touch.identifier])) {
        continue;
      }

      pos = translate(touch);
      self.ondata({ x: pos.x, y: pos.y, px: move.x, py: move.y });
      moves[touch.identifier] = pos;
    }
  });

  target.addEventListener('touchend', function (event) {
    var touch;

    self.onstopmove();
    if (!moves) {
      return;
    }

    event.preventDefault();

    for (var i = 0; i < event.changedTouches.length; i++) {
      touch = event.changedTouches[i];
      if (touch.identifier in moves) {
        delete moves[touch.identifier];
      }
    }

    if (Object.keys(moves) == 0) {
      moves = null;
    }
  });
}


function PointerInterface (target) {
  var self = this;
  var state = null;

  this.enabled = true;

  function translate (e) {
    return { x: (e.offsetX || e.layerX) * (target.width / target.clientWidth),
             y: (e.offsetY || e.layerY) * (target.height / target.clientHeight)};
  }

  function handler (name, callback) {
    if (target.attachEvent) {
      target.attachEvent('on' + name, callback);
    } else {
      target.addEventListener(name, callback);
    }
  }

  handler('mousedown', function (event) {

    if (self.enabled == false) {
      return;
    }

    self.onstartmove();

    state = translate(event);

    return false;
  });

  handler('mousemove', function (event) {
    var pos;

    if (!state || self.enabled == false) {
      return;
    }

    pos = translate(event);
    self.ondata({ x: pos.x, y: pos.y, px: state.x, py: state.y });
    state = pos;

    return false;
  });

  handler('mouseup', function (event) {
    self.onstopmove();
    state = null;
    return false;
  });
}


function CanvasViewport (target) {
  var context;
  
  if (typeof G_vmlCanvasManager == 'object') {
    G_vmlCanvasManager.initElement(target);
  }

  context = target.getContext('2d');

  target.style.transform = "translatez(0)";
  target.onselectstart = function() { return false; };

  this.draw = function (data) {
    context.strokeStyle = data.c;
    context.beginPath();
    context.moveTo(data.px, data.py);
    context.lineTo(data.x, data.y);
    context.lineWidth = BRUSH_WIDTH;
    context.lineCap = 'round';
    context.stroke();
  };
}


function PaintControls (target) {
  var self = this;
  var all;
  var alls;
  var initial;
  var menu;

  menu = document.getElementById('menu-expander');

  all = target.getElementsByTagName('input');
  initial = all[0];

  this.color = initial.value;


  function onmenuclick () {
    target.className = target.className ? '' : 'visible';
    return false;
  }

  function onchange (event) {
    if (event.preventDefault) {
      event.preventDefault();
    }
    self.color = event.target.value;
  }

  if (target.addEventListener) {
    target.addEventListener('change', onchange);
    menu.addEventListener('touchstart', onmenuclick);
    menu.addEventListener('click', onmenuclick);
  } else {
    all = target.getElementsByTagName('label');
    for (var i = 0; i < all.length; i++) {
      (function (label) {
        label.attachEvent('onclick', function () {
          var input = document.getElementById(label.getAttribute('for'));
          onchange({ target: input });
        });
      }(all[i]));
    }
    menu.attachEvent('onclick', onmenuclick);
  }
}

}(this));