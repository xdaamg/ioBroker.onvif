![Logo](admin/onvif_logo.png)
# ioBroker.onvif

[![NPM version](http://img.shields.io/npm/v/iobroker.onvif.svg)](https://www.npmjs.com/package/iobroker.onvif)
[![Downloads](https://img.shields.io/npm/dm/iobroker.onvif.svg)](https://www.npmjs.com/package/iobroker.onvif)
![Number of Installations (latest)](http://iobroker.live/badges/onvif-installed.svg)
![Number of Installations (stable)](http://iobroker.live/badges/onvif-stable.svg)
[![Dependency Status](https://img.shields.io/david/Haba1234/iobroker.onvif.svg)](https://david-dm.org/Haba1234/iobroker.onvif)
[![Known Vulnerabilities](https://snyk.io/test/github/Haba1234/ioBroker.onvif/badge.svg)](https://snyk.io/test/github/Haba1234/ioBroker.onvif)

[![NPM](https://nodei.co/npm/iobroker.onvif.png?downloads=true)](https://nodei.co/npm/iobroker.onvif/)

**Tests:**: [![Travis-CI](http://img.shields.io/travis/Haba1234/ioBroker.onvif/master.svg)](https://travis-ci.org/Haba1234/ioBroker.onvif)

## RU

### Настройка
1. Открыть Настройки драйвера
2. Нажать кнопку сканирования (сверху справа)
3. Ввести необходимые настройки или оставить по умолчанию: startRange - начальный ip адрес диапазона сканирования, 
End Range - конечный ip адрес диапазона сканирования, 
Port list - через запятую порты сервиса onvif (по умолчанию: 80, 7575, 8000, 8080, 8081), 
User name - по умолчанию admin, 
Password - по умолчанию admin
4. Нажать START SCAN

Если все сделано правильно, в основном окне настроек появятся найденые камеры и через несколько секунд должны будут подтянуться снапшоты

### События
Драйвер автоматически подписывается на события к настроенным камерам.
События, которые генерирует камера, появятся в объектах вида:

```
onvif.0.192_168_1_4_80.message.tns1:RuleEngine/FieldDetector/ObjectsInside
onvif.0.192_168_1_4_80.message.tns1:VideoSource/MotionAlarm.State
```

### Запрос снапшота
Для этого используется команда:
`sendTo('onvif.0', command, message, callback);`

Пример скрипта для запроса снапшота и отправка в телеграм:

```
const fs = require('fs');

function getSnapshot(caption){
    sendTo('onvif.0', 'saveFileSnapshot', {"id":"onvif.0.192_168_1_4_80", "file":"/opt/cameras/snapshot.jpg"}, (data) => {
        console.log('image принят: ' + data);
        if (data === "OK")
            sendTo('telegram.0', {text: '/opt/cameras/snapshot.jpg', caption: caption});
    });
}
```

*caption* - заголовок для картинки в телеграме.
Вызывать можно как по событию, так и по кнопке/рассписанию

## ENG

### Customization
1. Open Driver Settings
2. Press the scan button (top right)
3. Enter the necessary settings or leave the default: 
startRange - the starting ip address of the scanning range, 
End Range - the ending ip address of the scanning range, 
Port list - comma-separated ports of the onvif service (default: 80, 7575, 8000, 8080, 8081), 
User name - default admin, 
Password - default admin
4. Press START SCAN

If everything is made correctly, then the found cameras will appear in a primary window of settings and in several seconds snapshots will have to be tightened.

### Events
The driver automatically subscribes to events for the configured cameras.
The events generated by the camera will be displayed in the following objects:

```
onvif.0.192_168_1_4_80.message.tns1:RuleEngine/FieldDetector/ObjectsInside
onvif.0.192_168_1_4_80.message.tns1:VideoSource/MotionAlarm.State
```

### Snapshot request
To do this, use the command:
`sendTo('onvif.0', command, message, callback);`

Example of a script for request of the snapshot and sending to Telegram:

```
const fs = require('fs');

function getSnapshot(caption){
    sendTo('onvif.0', 'saveFileSnapshot', {"id":"onvif.0.192_168_1_4_80", "file":"/opt/cameras/snapshot.jpg"}, (data) => {
        console.log('image принят: ' + data);
        if (data === "OK")
            sendTo('telegram.0', {text: '/opt/cameras/snapshot.jpg', caption: caption});
    });
}
```

*caption* - is heading for the picture in Telegram

It is possible to cause both on an event, and according to the button/schedule

## Changelog

### 0.0.3 (2020-04-03)
* (haba1234) bag fix and different little things
* (haba1234) compact mode

### 0.0.2 (2018-11-20)
* (haba1234) add events and snapshot

### 0.0.1 (2018-02-20)
* (Kirov Ilya) intial commit

## License

The MIT License (MIT)

Copyright (c) 2018-2020 Haba1234 <b_roman@inbox.ru>