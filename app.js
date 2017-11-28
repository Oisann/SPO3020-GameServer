var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var shortid = require('shortid');

var SERVER_SEED = shortid.generate();
var SERVER_VERSION = '0.0.1';

var SERVER_PORT = process.env.PORT || 3000;
var PREFAB_COUNT = process.env.PREFAB_COUNT || 3;
var LANE_COUNT = process.env.LANE_COUNT || 4;

server.listen(SERVER_PORT);
var startTime = GetUnixTimestamp();

var LOBBIES = [];

app.get('/', function (req, res) {
    res.json({ "seed": SERVER_SEED, "version": SERVER_VERSION, "status": "OK", "online": 0, "uptime": (GetUnixTimestamp() - startTime) });
});

io.on("connection", function (socket) {
    console.log(socket.id, "connected");
    socket.emit('init', { version: SERVER_VERSION, seed: SERVER_SEED });

    socket.on('DUMMY', function (data) {
        //Answer directly
        io.sockets.connected[socket.id].emit('failedLogin', {status: "Error registering the client", error: error});
        //Send to everyone but yourself
        socket.broadcast.emit('registered', { id: "0" });
    });

    socket.on('gameloaded', function(data) {
        var lobby = LOBBIES[data.lobbyid];
        if(lobby !== undefined && lobby !== null) {
            var player = lobby.player1.id === socket.id ? lobby.player1 : (lobby.player2.id === socket.id ? lobby.player2 : null);
            var other = lobby.player1.id === socket.id ? lobby.player2 : (lobby.player2.id === socket.id ? lobby.player1 : null);
            if(player != null) {
                player.ready = true;
                console.log(socket.id, "ready");
                var one = { who: player.id === lobby.player1.id ? "0" : "1", pos: player.pos + "" };
                console.log(one);
                io.sockets.connected[player.id].emit('initpos', one);
                var two = { who: other.id === lobby.player1.id ? "0" : "1", pos: other.pos + "" };
                console.log(two);
                io.sockets.connected[player.id].emit('initpos', two);
                if(other.ready) {
                    console.log(player.id, 'and', other.id, 'is ready.');
                }
            }
        }
    });

    socket.on('move', function(data) {
        var lobby = LOBBIES[data.lobbyid];
        if(lobby !== undefined && lobby !== null) {
            var player = lobby.player1.id === socket.id ? lobby.player1 : (lobby.player2.id === socket.id ? lobby.player2 : null);
            var other = lobby.player1.id === socket.id ? lobby.player2 : (lobby.player2.id === socket.id ? lobby.player1 : null);
            if(player != null) {
                var dir = parseInt(data.direction);
                if(dir >= -2 && dir <= 2) {
                    var newPos = player.pos + dir;
                    if(newPos >= 0 && newPos <= (LANE_COUNT - 1)) {
                        if(newPos != other.pos) {
                            player.pos = newPos;
                            console.log(socket.id, 'moved to', player.pos);
                        } else {
                            console.log(socket.id, 'tried to move, but the lane was occupied.');
                        }
                    } else {
                        console.log('Player tried to move outside the map.');
                    }
                } else {
                    console.log('Player tried to move further than allowed.');
                }
                io.sockets.connected[other.id].emit('moved', { who: player.id === lobby.player1.id ? "0" : "1", pos: player.pos + "" });
                io.sockets.connected[player.id].emit('moved', { who: player.id === lobby.player1.id ? "0" : "1", pos: player.pos + "" });
            } else {
                console.log('Someone tried to move in someone elses lobby...');
            }
        } else {
            console.log('Someone tried to move while not in a lobby...');
        }
    });

    socket.on("abortmm", function(data) {
        console.log(socket.id, "aborted");
        for(var lobby in LOBBIES) {
            if(LOBBIES.hasOwnProperty(lobby)) {
                if(LOBBIES[lobby].player1.id === socket.id) {
                    clearTimeout(LOBBIES[lobby].time_out);
                    delete LOBBIES[lobby];
                }
            }
        }
    });

    socket.on("disconnect", function(data) {
        console.log(socket.id, "disconnected");
        for(var lobby in LOBBIES) {
            if(LOBBIES.hasOwnProperty(lobby)) {
                if(LOBBIES[lobby].player1.id === socket.id) {
                    if(LOBBIES[lobby].player2.id !== undefined)
                        io.sockets.connected[LOBBIES[lobby].player2.id].emit('stopped', { reason: "Other player quit" });
                    
                    clearTimeout(LOBBIES[lobby].time_out);
                    delete LOBBIES[lobby];
                } else if(LOBBIES[lobby].player2.id !== undefined) {
                    if(LOBBIES[lobby].player2.id === socket.id) {
                        if(LOBBIES[lobby].player1.id !== undefined)
                            io.sockets.connected[LOBBIES[lobby].player1.id].emit('stopped', { reason: "Other player quit" });
                        
                        clearTimeout(LOBBIES[lobby].time_out);
                        delete LOBBIES[lobby];
                    }
                }
            }
        }
    });

    socket.on('matchmake', function (data) {
        var newLobby = {
            timestamp: GetUnixTimestamp(),
            player1: {
                id: socket.id,
                ready: false,
                pos: 0
            },
            player2: {
                pos: (LANE_COUNT - 1),
                ready: false
            }
        }

        var pushit = true;
        var lobbyid = shortid.generate();

        for(var lobby in LOBBIES) {
            if(LOBBIES.hasOwnProperty(lobby)) {
                if(LOBBIES[lobby].player1.id !== socket.id && LOBBIES[lobby].player2.id === undefined && LOBBIES[lobby].timestamp < newLobby.timestamp) {
                    pushit = false;
                    lobbyid = lobby;
                    newLobby.player2 = {};
                    newLobby = LOBBIES[lobby];
                    newLobby.player2.id = socket.id
                }
            }
        }

        if(pushit) {
            LOBBIES[lobbyid] = newLobby;
            LOBBIES[lobbyid].time_out = setTimeout(function() {
                console.log("timed out");
                if(io.sockets.connected[socket.id] !== undefined)
                    io.sockets.connected[socket.id].emit('timeout', { reason: "found nobody" });
                delete LOBBIES[lobbyid];
            }, 30 * 1000);
            console.log('In queue');
        } else {
            console.log('match found');
            clearTimeout(newLobby.time_out);
            newLobby.map = GenerateMap(20);
            console.log(newLobby.player1.pos, newLobby.player2.pos);
            var test = { lobbyid: lobbyid, playerNumber: "0", map: newLobby.map };
            io.sockets.connected[newLobby.player1.id].emit('matchfound', test);
            test.playerNumber = "1";
            io.sockets.connected[newLobby.player2.id].emit('matchfound', test);
        }
    });
});

function GenerateMap(length) {
    var map = "";
    for(var i = 0; i < length; i++) {
        map += RandomBetween(0, PREFAB_COUNT - 1);
    }
    return map;
}

function RandomBetween(min, max) {
    return Math.floor(Math.random()*(max-min+1)+min);
}

function GetUnixTimestamp() {
    return Math.round(+new Date()/1000);
}