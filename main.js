/**
 *
 * Onvif adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
//const adapterName = require('./package.json').name.split('.').pop();
// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
//var adapter = new utils.Adapter('onvif');
const Cam = require('onvif').Cam;
const flow = require('nimble');
require('onvif-snapshot');
const url = require('url');
const fs = require('fs');
const request = require('request');
const inherits = require('util').inherits;

let isDiscovery = false;
let timeoutID;

let cameras = {};

function override(child, fn) {
    child.prototype[fn.name] = fn;
    fn.inherited = child.super_.prototype[fn.name];
}

// overload Cam to preserve original hostname
function MyCam(options, callback) {
    MyCam.super_.call(this, options, callback);
}
inherits(MyCam, Cam);


override(MyCam, function getSnapshotUri(options, callback) {
    getSnapshotUri.inherited.call(this, options, function(err, res){
        if(!err) {
            const parsedAddress = url.parse(res.uri);
            // If host for service and default host dirrers, also if preserve address property set
            // we substitute host, hostname and port from settings
            if (this.hostname !== parsedAddress.hostname) {
                adapter.log.debug('need replace '+res.uri);
                res.uri = res.uri.replace(parsedAddress.hostname, this.hostname);
                adapter.log.debug('after replace '+res.uri);
            }
        }
        if (callback) callback(err, res);
    });
});

function getSnapshot(from, command, message, callback){
    var camId = message.id,
        cam = cameras[camId];
    adapter.log.debug('getSnapshot: ' + JSON.stringify(message));
    if (cam) {
        // get snapshot
        cam.getSnapshot((err, data) => {
            if(err) throw err;
            adapter.log.debug(JSON.stringify(data));
            adapter.sendTo(from, command, data, callback);
        });
    }
}

function saveFileSnapshot(from, command, message, callback){
    var camId = message.id,
    cam = cameras[camId];
    adapter.log.debug('saveFileSnapshot: ' + JSON.stringify(message));
    if (cam) {
        // get snapshot
        cam.getSnapshotUri({protocol:'RTSP'}, function(err, stream) {
            adapter.log.debug('getSnapshotUri: - ' + JSON.stringify(stream));
            saveImage(stream.uri, cam.username, cam.password, message.file, (data) => {
                adapter.sendTo(from, command, data, callback);
            });
        });
    }
}

function saveImage(stream, username, password, file, callback){
    let picStream;
    request
		.get(stream, {
			'auth': {
				'user': username,
				'pass': password,
				'sendImmediately': false
			}
		})
		.on('error', function(err) {
			adapter.log.error(err)
			callback(err);
		})
		.pipe(picStream = fs.createWriteStream(file))
    picStream.on('close', function() {
        adapter.log.debug('Image saved');
        callback("OK");
    });
}

function parseEvents(devId, events){
var value;
	try { 
		if (events.notificationMessage !== undefined){
			adapter.log.debug("notificationMessage: " + JSON.stringify(events.notificationMessage));
			let name = "message";
			for (let element1 in events.notificationMessage){
				for (let element2 in events.notificationMessage[element1]){
					//adapter.log.debug("arr2: " + element2);
					if (element2 === "_") name = name + "." + events.notificationMessage[element1][element2]; // topic
					if (element2 === "message") {
						for (let element3 in events.notificationMessage[element1][element2]){
							//adapter.log.debug("arr3: " + element3);
							if (element3 === "$") {
								//adapter.log.debug("Time: " + events.notificationMessage[element1][element2][element3].UtcTime); // UtcTime
								value = events.notificationMessage[element1][element2][element3].UtcTime;
								//adapter.log.warn(value.toLocaleString('ru-RU'));
								updateState(devId, name + ".Time", value.toLocaleString('ru-RU'), {"type": "string", "read": true, "write": false});
							}
							if ((element3 === "source")||(element3 === "data")) {
								let nameObj;
								for (let element4 in events.notificationMessage[element1][element2][element3].simpleItem){
								    //adapter.log.debug("arr4: " + element4);
								    let len = Object.keys(events.notificationMessage[element1][element2][element3].simpleItem).length;
								    if (len == 1) {
										nameObj = name + "." + events.notificationMessage[element1][element2][element3].simpleItem[element4].Name;
										value = events.notificationMessage[element1][element2][element3].simpleItem[element4].Value;
								    } else {
										nameObj = name + "." + events.notificationMessage[element1][element2][element3].simpleItem[element4]["$"].Name;
										value = events.notificationMessage[element1][element2][element3].simpleItem[element4]["$"].Value;
									}
									adapter.log.debug("Name: " + nameObj); // Name
									adapter.log.debug("Value: " + value); // Value
									updateState(devId, nameObj, value, {"type": typeof(value), "read": true, "write": false});
								}
							}
						}
					}
				}
			}
		} //Events: {"currentTime":"2019-01-03T04:35:17.000Z","terminationTime":"2019-01-03T04:44:17.000Z"}
		if (events.currentTime !== undefined){
			//пока не знаю куда применить
		}
	} catch (e) {
		adapter.log.debug("Error:   " + e);  
	}
}

function camEvents(devId, cam) {
  try {
    cam.createPullPointSubscription(function(err, data) {
        if (err) {
			//let errTimeout = 200;
            adapter.log.error("createPullPointSubscription: " + err);
            //if (err.indexOf('Network timeout') !==-1){
            //    errTimeout = 60000; // 1 min
            //    adapter.log.error(devId + " Network timeout");
            //    updateState(devId, 'connection', false, {"type": "boolean", "read": true, "write": false});
            //}
            //setTimeout(function () {
            //    adapter.log.debug("Restart createPullPointSubscription");
            //    camEvents(devId, cam); // restart createPullPointSubscription
            //}, 200); 
        } else {
            adapter.log.debug("createPullPointSubscription:   " + JSON.stringify(data));
            updateState(devId, 'connection', true, {"type": "boolean", "read": true, "write": false});
            timeoutID = setTimeout(function tick() {
                cam.pullMessages({timeout: 60000, messageLimit: 1}, function(err, events) {
                    if (err) {
                        adapter.log.debug("pullMessages: " + err + ". Resubscribe to events");
                        clearTimeout(timeoutID);
                        camEvents(devId, cam);
                    } else {
                        adapter.log.debug("Events:   " + JSON.stringify(events));
                        parseEvents(devId, events);     
                        timeoutID = setTimeout(tick, 200);
                    }
                });
            }, 200);
        }
    });
    
  } catch (e) {
      //callback();
      adapter.log.debug("Error:   " + e);  
  }
}


function startCameras(){
    cameras = {};
    adapter.log.debug('startCameras');
    try {
    adapter.getDevices((err, result) => {
        adapter.log.debug('startCameras: ' + JSON.stringify(result));
        for (var item in result) {
            let dev = result[item],
                devData = dev.common.data,
                cam;
            cam = new MyCam({
                hostname: devData.ip,
                port: devData.port,
                username: devData.user,
                password: devData.pass,
                //timeout : 30000,
                preserveAddress: true
            }, function(err) {
                if (!err) {
                    adapter.log.debug('capabilities: ' + JSON.stringify(cam.capabilities));
                    adapter.log.debug('uri: ' + JSON.stringify(cam.uri));
                    cameras[dev._id] = cam;
                    cam.getEventProperties(function(err, info) {
                        if (err) { adapter.log.error(err); }
                        else {
                            adapter.log.debug("getEventProperties:   " + JSON.stringify(info));
                            cam.getEventServiceCapabilities(function(err, info) {
                                if (err) { adapter.log.error(err); }
                                adapter.log.debug("getEventServiceCapabilities:   " + JSON.stringify(info));
                                if (info != undefined){  // || (info === 'undefined')
                                    if (info.hasOwnProperty('WSPullPointSupport')){
                                        if (info.WSPullPointSupport) {
                                            camEvents(dev._id, cam);
                                        } else adapter.log.warn('Events. Service Capabilities. PullPointSupport = false');
                                    } else adapter.log.warn('Events. Service Capabilities. Pull Point not support!');
                                } else adapter.log.warn('Events. Service Capabilities: undefined');
                            });
                        } 
                    });
                } else {
                    adapter.log.debug('startCameras err=' + err +' dev='+ JSON.stringify(devData));
                    updateState(dev._id, 'connection', false, {"type": "boolean", "read": true, "write": false});
                    setTimeout(function () {
                        adapter.log.debug("Restart function 'startCameras'");
                        startCameras(); // restart startCameras
                    }, 3000000); // 10 min
                }
            });
        }
    });
    } catch (e) {
      adapter.log.debug("Error 2:   " + e);  
  }
}

function updateStateWithTimeout(dev_id, name, value, common, timeout, outValue) {
    updateState(dev_id, name, value, common);
    setTimeout(() => updateState(dev_id, name, outValue, common), timeout);
}

function updateState(devId, name, value, common) {
    let id = devId + '.' + name;
    adapter.setObjectNotExists(id, {type: 'state', common: common}, (err, data) => {
        //adapter.log.info('err=' + JSON.stringify(err));
        //adapter.log.info('data=' + JSON.stringify(data));
        //adapter.log.info('id=' + JSON.stringify(id));
        //adapter.log.info('value=' + JSON.stringify(value));
        //adapter.log.info('common=' + JSON.stringify(common));
        if (value !== undefined) {
            adapter.setState(id, value, true);
        }
    });
}

function deleteDevice(from, command, msg, callback) {
    var id = msg.id,
        dev_id = id.replace(adapter.namespace+'.', '');
    adapter.log.error('delete device '+dev_id);
    adapter.deleteDevice(dev_id, function(){
        adapter.sendTo(from, command, {}, callback);
    });
}


function getDevices(from, command, message, callback){
    var rooms;
    adapter.getEnums('enum.rooms', function (err, list) {
        if (!err){
            rooms = list['enum.rooms'];
        }
        adapter.getDevices((err, result) => {
            if (result) {
                var devices = [], cnt = 0, len = result.length;
                for (var item in result) {
                    if (result[item]._id) {
                        var id = result[item]._id.substr(adapter.namespace.length + 1);
                        let devInfo = result[item];
                        devInfo.rooms = [];
                        for (var room in rooms) {
                            if (!rooms[room] || !rooms[room].common || !rooms[room].common.members)
                                continue;
                            if (rooms[room].common.members.indexOf(devInfo._id) !== -1) {
                                devInfo.rooms.push(rooms[room].common.name);
                            }
                        }
                        cnt++;
                        devices.push(devInfo);
                        if (cnt==len) {
                            adapter.log.debug('getDevices result: ' + JSON.stringify(devices));
                            adapter.sendTo(from, command, devices, callback);
                        }
                        // adapter.getState(result[item]._id+'.paired', function(err, state){
                        //     cnt++;
                        //     if (state) {
                        //         devInfo.paired = state.val;
                        //     }
                        //     devices.push(devInfo);
                        //     if (cnt==len) {
                        //         adapter.log.info('getDevices result: ' + JSON.stringify(devices));
                        //         adapter.sendTo(from, command, devices, callback);
                        //     }
                        // });
                    }
                }
                if (len == 0) {
                    adapter.log.warn('getDevices result: ' + JSON.stringify(devices));
                    adapter.sendTo(from, command, devices, callback);
                }
            }
        });
    });
}


function discovery(options, callback) {
    if (isDiscovery) {
        return callback && callback('Yet running');
    }
    isDiscovery = true;
    adapter.setState('discoveryRunning', true, true);

    var start_range = options.start_range,  //'192.168.1.1'
        end_range = options.end_range || options.start_range,  //'192.168.1.254'
        port_list = options.ports || '80, 7575, 8000, 8080, 8081',
        port_list = port_list.split(',').map(item => item.trim()),
        user = options.user || 'admin',  // 'admin'
        pass = options.pass || 'admin';  // 'admin'

    var ip_list = generate_range(start_range, end_range);
    if (ip_list.length === 1 && ip_list[0] === '0.0.0.0') {
        ip_list = [options.start_range];
    }

    var devices = [], counter = 0, scanLen = ip_list.length * port_list.length;

    // try each IP address and each Port
    ip_list.forEach(function(ip_entry) {
        port_list.forEach(function(port_entry) {

            adapter.log.debug(ip_entry + ' ' + port_entry);

            new MyCam({
                hostname: ip_entry,
                username: user,
                password: pass,
                port: port_entry,
                timeout : 10000,
                preserveAddress: true
            }, function CamFunc(err) {
                counter++;
                if (err) {
                    if (counter == scanLen) processScannedDevices(devices, callback);
                    return;
                }

                let cam_obj = this;

                let got_date;
                let got_info;
                let got_live_stream_tcp;
                let got_live_stream_udp;
                let got_live_stream_multicast;
                let got_recordings;
                let got_replay_stream;
				let hasEvents = false;
				let hasTopics = false;

                // Use Nimble to execute each ONVIF function in turn
                // This is used so we can wait on all ONVIF replies before
                // writing to the console
                flow.series([
                    function(callback) {
                        cam_obj.getSystemDateAndTime(function(err, date, xml) {
							if (!err) {adapter.log.debug('Device Time   ' + date);}
                            if (!err) got_date = date;
                            callback();
                        });
                    },
                    function(callback) {
                        cam_obj.getDeviceInformation(function(err, info, xml) {
							if (!err) {adapter.log.debug('Manufacturer  ' + info.manufacturer);}
							if (!err) {adapter.log.debug('Model         ' + info.model);}
							if (!err) {adapter.log.debug('Firmware      ' + info.firmwareVersion);}
							if (!err) {adapter.log.debug('Serial Number ' + info.serialNumber);}
                            if (!err) got_info = info;
                            callback();
                        });
                    },
					function(callback) {
						cam_obj.getCapabilities(function(err, data, xml) {
							if (err) {
								adapter.log.debug(err);
							}
							if (!err && data.events && data.events.WSPullPointSupport && data.events.WSPullPointSupport == true) {
								adapter.log.debug('Camera supports WSPullPoint');
								hasEvents = true;
							} else {
								adapter.log.debug('Camera does not show WSPullPoint support, but trying anyway');
								// Have an Axis cameras that says False to WSPullPointSuppor but supports it anyway
								hasEvents = true; // Hack for Axis cameras
							}

							if (hasEvents == false) {
								adapter.log.debug('This camera/NVT does not support PullPoint Events');
							}
							callback();
						})
					},
					function(callback) {
						if (hasEvents) {
							cam_obj.getEventProperties(function(err, data, xml) {
								if (err) {
									adapter.log.debug(err);
								} else {
									// Display the available Topics
									let parseNode = function(node, topicPath) {
										// loop over all the child nodes in this node
										for (const child in node) {
											if (child == "$") {continue;} else if (child == "messageDescription") {
												// we have found the details that go with an event
												// examine the messageDescription
												let IsProperty = false;
												let source = '';
												let data = '';
												if (node[child].$ && node[child].$.IsProperty) {IsProperty = node[child].$.IsProperty}
												if (node[child].source) {source = JSON.stringify(node[child].source)}
												if (node[child].data) {data = JSON.stringify(node[child].data)}
												adapter.log.debug('Found Event - ' + topicPath.toUpperCase())
												//console.log('  IsProperty=' + IsProperty);
												if (source.length > 0) {adapter.log.debug('  Source=' + source);}
												if (data.length > 0) {adapter.log.debug('  Data=' + data);}
												hasTopics = true
												return
											} else {
												// decend into the child node, looking for the messageDescription
												parseNode(node[child], topicPath + '/' + child)
											}
										}
									}
									parseNode(data.topicSet, '')
								}
								adapter.log.debug('');
								adapter.log.debug('');
								callback()
							});
						} else {
							callback()
						}
					},
                    function(callback) {
                        try {
                            cam_obj.getStreamUri({
                                protocol: 'RTSP',
                                stream: 'RTP-Unicast'
                            }, function(err, stream, xml) {
								if (err) {
									adapter.log.error(err);
								}
                                if (!err) got_live_stream_tcp = stream;
                                callback();
                            });
                        } catch(err) {callback();}
                    },
                    function(callback) {
                        try {
                            cam_obj.getStreamUri({
                                protocol: 'UDP',
                                stream: 'RTP-Unicast'
                            }, function(err, stream, xml) {
                                if (!err) got_live_stream_udp = stream;
                                callback();
                            });
                        } catch(err) {callback();}
                    },
                    function(callback) {
                        try {
                            cam_obj.getStreamUri({
                                protocol: 'UDP',
                                stream: 'RTP-Multicast'
                            }, function(err, stream, xml) {
                                if (!err) got_live_stream_multicast = stream;
                                callback();
                            });
                        } catch(err) {callback();}
                    },
					function(callback) {
						try {
							cam_obj.getPresets({}, // use 'default' profileToken
								// Completion callback function
								// This callback is executed once we have a list of presets
								function (err, stream, xml) {
									if (err) {
										adapter.log.warn("GetPreset Error " + err);
										//return;
										callback();
									} else {
										// loop over the presets and populate the arrays
										// Do this for the first 9 presets
										adapter.log.warn("GetPreset Reply: " +  + JSON.stringify(stream));
										/*let count = 1;
										for(let item in stream) {
											let name = item;          //key
											let token = stream[item]; //value
											// It is possible to have a preset with a blank name so generate a name
											if (name.length == 0) name = 'no name (' + token + ')';
											preset_names.push(name);
											preset_tokens.push(token);

											// Show first 9 preset names to user
											if (count < 9) {
												adapter.log.warn('Press key ' + count + ' for preset "' + name + '"');
											count++;
											}
										}*/
										callback();
									}
								}
							);
						} catch(err) {callback();}
					},
					function(callback) {
                        cam_obj.getConfigurations(function(err, data, xml) {
                            if (!err) adapter.log.warn("getConfigurations: " +  + JSON.stringify(data));
                            callback();
                        });
                    },
					function(callback) {
                        cam_obj.getNodes(function(err, data, xml) {
                            if (!err) adapter.log.warn("getNodes: " +  + JSON.stringify(data));
                            callback();
                        });
                    },
                    function(callback) {
                        cam_obj.getRecordings(function(err, recordings, xml) {
                            if (!err) got_recordings = recordings;
                            callback();
                        });
                    },
                    function(callback) {
                        // Get Recording URI for the first recording on the NVR
                        if (got_recordings) {
                            adapter.log.debug('got_recordings='+JSON.stringify(got_recordings));
                            if (Array.isArray(got_recordings)) {
                                got_recordings = got_recordings[0];
                            }
                            cam_obj.getReplayUri({
                                protocol: 'RTSP',
                                recordingToken: got_recordings.recordingToken
                            }, function(err, stream, xml) {
                                if (!err) got_replay_stream = stream;
                                callback();
                            });
                        } else {
                            callback();
                        }
                    },
                    function(localcallback) {
                        adapter.log.debug('------------------------------');
                        adapter.log.debug('Host: ' + ip_entry + ' Port: ' + port_entry);
                        adapter.log.debug('Date: = ' + got_date);
                        adapter.log.debug('Info: = ' + JSON.stringify(got_info));
                        if (got_live_stream_tcp) {
                            adapter.log.debug('First Live TCP Stream: =       ' + got_live_stream_tcp.uri);
                        }
                        if (got_live_stream_udp) {
                            adapter.log.debug('First Live UDP Stream: =       ' + got_live_stream_udp.uri);
                        }
                        if (got_live_stream_multicast) {
                            adapter.log.debug('First Live Multicast Stream: = ' + got_live_stream_multicast.uri);
                        }
                        if (got_replay_stream) {
                            adapter.log.debug('First Replay Stream: = ' + got_replay_stream.uri);
                        }
                        adapter.log.debug('capabilities: ' + JSON.stringify(cam_obj.capabilities));
                        adapter.log.debug('------------------------------');
                        devices.push({
                            id: getId(ip_entry+':'+port_entry),
                            name: ip_entry+':'+port_entry,
                            ip: ip_entry,
                            port: port_entry,
                            user: user,
                            pass: pass,
                            ip: ip_entry,
                            port: port_entry,
                            cam_date: got_date,
                            info: got_info,
                            live_stream_tcp: got_live_stream_tcp,
                            live_stream_udp: got_live_stream_udp,
                            live_stream_multicast: got_live_stream_multicast,
                            replay_stream: got_replay_stream
                        });
                        localcallback();
                        if (counter == scanLen) processScannedDevices(devices, callback);
                    }
                ]); // end flow

            });
        }); // foreach
    }); // foreach
}


function processScannedDevices(devices, callback) {
    // check if device is new
    var newInstances = [], currDevs = [];
    adapter.getDevices((err, result) => {
        if(result) {
            for (var item in result) {
                if (result[item]._id) {
                    currDevs.push(result[item]._id);
                }
            }
        }
        for (var devInd in devices) {
            var dev = devices[devInd];
            if (currDevs.indexOf(dev.id) == -1) {
                newInstances.push(dev);
                // create new camera
                updateDev(dev.id, dev.name, dev);
            }
        }
        startCameras();
        if (callback) callback(newInstances);
    });
}


function updateDev(dev_id, dev_name, devData) {
    // create dev
    adapter.log.warn('создать dev_id: ' + JSON.stringify(dev_id));
    adapter.log.debug('создать dev_name: ' + JSON.stringify(dev_name));
    adapter.log.debug('создать devData: ' + JSON.stringify(devData));
    adapter.setObjectNotExists(dev_id, {
        type: 'device',
        common: {name: dev_name, data: devData}
    }, {}, function (obj) {
        adapter.getObject(dev_id, function(err, obj) {
            if (!err && obj) {
                // if update
                adapter.extendObject(dev_id, {
                    type: 'device',
                    common: {data: devData}
                });
                startCameras();
            }
        });
    });
}


function getId(addr) {
    return addr.replace(/\./g, '_').replace(':', '_');
}


function generate_range(start_ip, end_ip) {
    var start_long = toLong(start_ip);
    var end_long = toLong(end_ip);
    if (start_long > end_long) {
        var tmp=start_long;
        start_long=end_long
        end_long=tmp;
    }
    var range_array = [];
    var i;
    for (i=start_long; i<=end_long;i++) {
        range_array.push(fromLong(i));
    }
    return range_array;
}


//toLong taken from NPM package 'ip'
function toLong(ip) {
    var ipl = 0;
    ip.split('.').forEach(function(octet) {
        ipl <<= 8;
        ipl += parseInt(octet);
    });
    return(ipl >>> 0);
};


//fromLong taken from NPM package 'ip'
function fromLong(ipl) {
    return ((ipl >>> 24) + '.' +
        (ipl >> 16 & 255) + '.' +
        (ipl >> 8 & 255) + '.' +
        (ipl & 255) );
};

class Onvif extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'Onvif',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        //this.log.info('config option1: ' + this.config.option1);
        //this.log.info('config option2: ' + this.config.option2);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        /*await this.setObjectAsync('testVariable', {
            type: 'state',
            common: {
                name: 'testVariable',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: true,
            },
            native: {},
        });*/

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');

        /*
        setState examples
        you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        //await this.setStateAsync('testVariable', true);

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        //await this.setStateAsync('testVariable', { val: true, ack: true });

        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        //await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

        // examples for the checkPassword/checkGroup functions
        //let result = await this.checkPasswordAsync('admin', 'iobroker');
        //this.log.info('check user admin pw iobroker: ' + result);

        //result = await this.checkGroupAsync('admin', 'admin');
        //this.log.info('check group user admin group admin: ' + result);
		
		await this.setStateAsync('discoveryRunning', { val: false, ack: true });
		//await this.setStateAsync('discoveryRunning', false, true );
		//startCameras();
    }
	
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
			clearTimeout(timeoutID);
			if (isDiscovery) {
				//adapter && adapter.setState && adapter.setState('discoveryRunning', false, true);
				this.setStateAsync('discoveryRunning', false, true );
				isDiscovery = false;
			}
            this.log.debug('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.debug(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			if (!state.ack){
				//const devId = adapter.namespace + '.' + id.split('.')[2]; // iobroker device id
				//this.log.debug("devId = " + devId);
			}
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
        }
    }

     /**
      * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
      * Using this method requires "common.message" property to be set to true in io-package.json
      * @param {ioBroker.Message} obj
      */
    onMessage(obj) {
     	if (typeof obj === 'object' && obj.message) {
     		if (obj.command === 'discovery') {
     			// e.g. send email or pushover or whatever
     			this.log.debug('Received "discovery" event');
				discovery(obj.message, function (error, newInstances, devices) {
					isDiscovery = false;
					this.log.debug('Discovery finished');
					//adapter.setState('discoveryRunning', false, true);
					this.setStateAsync('discoveryRunning', false, true );
					//adapter.sendTo(obj.from, obj.command, {
					//	error:        error,
					//	devices:      devices,
					//	newInstances: newInstances
					//}, obj.callback);
					if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
				});
     			// Send response in callback if required
     			//if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
     		}
			if (obj.command === 'getDevices') {
				this.log.warn('Received "getDevices" event');
				getDevices(obj.from, obj.command, obj.message, obj.callback);
			}
			if (obj.command === 'deleteDevice') {
				this.log.warn('Received "deleteDevice" event');
				deleteDevice(obj.from, obj.command, obj.message, obj.callback);
			}
			if (obj.command === 'getSnapshot') {
				this.log.warn('Received "getSnapshot" event');
				getSnapshot(obj.from, obj.command, obj.message, obj.callback);
			}
			if (obj.command === 'saveFileSnapshot') {
				this.log.warn('Received "saveFileSnapshot" event');
				saveFileSnapshot(obj.from, obj.command, obj.message, obj.callback);
			}
     	}
    }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Onvif(options);
} else {
    // otherwise start the instance directly
    new Onvif();
}