import {Vector, VectorCollector} from "../www/js/helpers.js";
import {Player} from "../www/js/player.js";
import {ServerClient} from "../www/js/server_client.js";

export class ServerPlayer extends Player {

    constructor() {
        super();
        this.position_changed   = false;
        this.chunk_addr         = new Vector(0, 0, 0);
        this.chunk_addr_o       = new Vector(0, 0, 0);
        this.chunks             = new VectorCollector();
        this.nearby_chunk_addrs = new VectorCollector();
    }

    //
    async onJoin(session_id, skin, conn, world) {
        this.conn = conn;
        this.world = world;
        conn.player = this;
        conn.on('message', async (req) => {
            let cmd = JSON.parse(req);

            try {
                switch(cmd.name) {
                
                    // Connect
                    case ServerClient.CMD_CONNECT: {
                        let world_guid = cmd.data.world_guid;
                        this.session = await Game.db.GetPlayerSession(session_id);
                        world.onPlayer(this, skin);
                        break;
                    }

                    // Send message to chat
                    case ServerClient.CMD_CHAT_SEND_MESSAGE: {
                        this.world.chat.sendMessage(this, cmd.data);
                        break;
                    }

                    // Change spawn position
                    case ServerClient.CMD_CHANGE_POS_SPAWN: {
                        this.changePosSpawn(cmd.data);
                        break;
                    }

                    case ServerClient.CMD_TELEPORT_REQUEST: {
                        this.world.teleportPlayer(this, cmd.data);
                        break;
                    }

                    // Player state
                    case ServerClient.CMD_PLAYER_STATE: {
                        // Update local position
                        this.world.changePlayerPosition(this, cmd.data);
                        // Send new position to other players
                        cmd.data.id = this.session.user_id;
                        cmd.data.username = this.session.username
                        let packets = [{
                            name: ServerClient.CMD_PLAYER_STATE,
                            data: cmd.data
                        }];
                        this.world.sendAll(packets, [this.session.user_id]);
                        break;
                    }

                    // Save inventory
                    case ServerClient.CMD_SAVE_INVENTORY: {
                        this.world.db.savePlayerInventory(this, cmd.data);
                        break;
                    }

                    // Modify indicator request
                    case ServerClient.CMD_MODIFY_INDICATOR_REQUEST: {
                        switch (cmd.data.indicator) {
                            case 'live': {
                                this.state.indicators.live.value += cmd.data.value;
                                break;
                            }
                            case 'food': {
                                this.state.indicators.food.value += cmd.data.value;
                                break;
                            }
                            case 'oxygen': {
                                this.state.indicators.oxygen.value += cmd.data.value;
                                break;
                            }
                        }
                        if (cmd.data.indicator == 'live' && this.state.indicators.live.value <= 0) {
                            this.state.indicators.live.value = 20;
                            this.world.teleportPlayer(this, {
                                place_id: 'spawn',
                            })
                        }
                        // notify player about his new indicators
                        let packets = [{
                            name: ServerClient.CMD_ENTITY_INDICATORS,
                            data: {
                                indicators: this.state.indicators
                            }
                        }];
                        this.world.sendSelected(packets, [this.session.user_id], []);
                        // @todo notify all about change?
                        break;
                    }

                    // Request chest content
                    case ServerClient.CMD_LOAD_CHEST: {
                        this.world.entities.loadChest(this, cmd.data);
                        break;
                    }
                        
                    // Пользователь подгрузил чанк
                    case ServerClient.CMD_CHUNK_LOAD: {
                        let addr = new Vector(cmd.data.pos);
                        if(this.nearby_chunk_addrs.has(addr)) {
                            let chunk = await this.world.loadChunkForPlayer(this, addr);
                            chunk.sendToPlayer(this);
                        }
                        break;
                    }

                    case ServerClient.CMD_BLOCK_SET: {
                        this.world.setBlock(this, cmd.data);
                        break;
                    }
                
                    case ServerClient.CMD_SET_CHEST_SLOT_ITEM: {
                        // @ParamChestSetSlotItem
                        this.world.entities.setChestSlotItem(this, cmd.data);
                        break;
                    }

                    case ServerClient.CMD_CREATE_ENTITY: {
                        this.world.createEntity(this, cmd.data);
                        break;
                    }

                    case ServerClient.CMD_CHANGE_RENDER_DIST: {
                        this.changeRenderDist(parseInt(cmd.data));
                        break;
                    }
                                
                }
            } catch(e) {
                console.log(e);
                let packets = [{
                    name: ServerClient.CMD_ERROR,
                    data: {
                        message: e
                    }
                }];
                this.world.sendSelected(packets, [this.session.user_id], []);
            }
        });
        //
        conn.on('close', async (e) => {
            this.world.onLeave(this);
        });
        //
        this.sendPackets([{
            name: ServerClient.CMD_HELLO,
            data: 'Welcome to MadCraft ver. 0.0.1'
        }]);
        this.sendPackets([{name: ServerClient.CMD_WORLD_INFO, data: world.info}]);
    }

    // onLeave...
    async onLeave() {
        for(let addr of this.chunks) {
            (await this.world.chunks.get(addr, false))?.removePlayer(this);
        }
    }

    // sendPackets...
    sendPackets(packets) {
        this.conn.send(JSON.stringify(packets));
    }

    // changePosSpawn...
    changePosSpawn(params) {
        this.world.db.changePosSpawn(this, params);
        this.state.pos_spawn = new Vector(params.pos);
        let message = 'Установлена точка возрождения ' + params.pos.x + ", " + params.pos.y + ", " + params.pos.z;
        this.world.chat.sendSystemChatMessageToSelectedPlayers(message, [this.session.user_id]);
    }
    
    // Change render dist
    // 0(1chunk), 1(9), 2(25chunks), 3(45), 4(69), 5(109), 6(145), 7(193), 8(249) 9(305) 10(373) 11(437) 12(517)
    changeRenderDist(value) {
        if(Number.isNaN(value)) {
            value = 4;
        }
        value = Math.max(value, 2);
        value = Math.min(value, 16);
        this.state.chunk_render_dist = value;
        this.world.chunks.checkPlayerVisibleChunks(this, true);
        this.world.db.changeRenderDist(this, value);
    }

    // Отправка содержимого сундука
    sendChest(chest) {
        let packets = [{
            name: ServerClient.CMD_CHEST_CONTENT,
            data: chest
        }];
        this.sendPackets(packets);
    }

    addChunk(chunk) {
        this.chunks.set(chunk.addr, chunk.addr);
    }

}