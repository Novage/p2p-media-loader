window.p2pml = require("p2p-media-loader-core");

var browserRTC = require('get-browser-rtc')();
window.p2pml.WEBRTC_SUPPORT = !!browserRTC && browserRTC.RTCPeerConnection.prototype.createDataChannel !== undefined;
