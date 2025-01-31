import { Helpers } from "./helpers.js";

export const COLOR_PALETTE = {
    white: [0, 0],      // Белая керамика - white_terracotta
    orange: [2, 1],     // Оранжевая керамика - orange_terracotta
    magenta: [2, 3],    // Сиреневая керамика - magenta_terracotta
    light_blue: [3, 2], // Светло-синяя керамика - light_blue_terracotta
    yellow: [3, 1],     // Жёлтая керамика - yellow_terracotta
    lime: [0, 2],       // Лаймовая керамика - lime_terracotta
    pink: [3, 3],       // Розовая керамика - pink_terracotta
    gray: [2, 0],       // Серая керамика - gray_terracotta
    light_gray: [1, 0], // Светло-серая керамика - light_gray_terracotta
    cyan: [2, 2],       // Бирюзовая керамика - cyan_terracotta
    purple: [1, 3],     // Фиолетовая керамика - purple_terracotta
    blue: [0, 3],       // Синяя керамика - blue_terracotta
    brown: [0, 1],      // Коричневая керамика - brown_terracotta
    green: [1, 2],      // Зелёная керамика - green_terracotta
    red: [1, 1],        // Красная керамика - red_terracotta
    black: [3, 0],      // Чёрная керамика - black_terracotta
};

export class Resources {

    static async getModelAsset(key) {
        if (!this.models[key]) {
            return;
        }

        const entry = this.models[key];

        if (entry.asset) {
            return entry.asset;
        }

        let asset;

        if (entry.type == 'json') {
            asset = Resources.loadJsonModel(entry, key, entry.baseUrl);
        }

        return entry.asset = asset;
    }

    static onLoading = (state) => {};

    /**
     * @param settings
     * @param settings.glsl need glsl
     * @param settings.wgsl need wgls for webgpu
     * @param settings.imageBitmap return imageBitmap for image instead of Image
     * @returns {Promise<void>}
     */
    static load(settings) {
        this.shaderBlocks       = {};
        this.codeMain           = {};
        this.codeSky            = {};
        this.pickat             = {};
        this.shadow             = {};
        // this.sky                = {};
        this.clouds             = {};
        this.inventory          = {};
        this.physics            = {};
        this.models             = {};
        this.sounds             = {};
        this.sound_sprite_main  = {};
        this.weather            = {};

        // Functions
        const loadTextFile = Resources.loadTextFile;
        const loadImage = (url) => Resources.loadImage(url, settings.imageBitmap);
        
        let all = [];

        // Others
        all.push(loadImage('media/rain.png').then((img) => { this.weather.rain = img}));
        all.push(loadImage('media/snow.png').then((img) => { this.weather.snow = img}));
        all.push(loadImage('media/pickat_target.png').then((img) => { this.pickat.target = img}));
        all.push(loadImage('media/shadow.png').then((img) => { this.shadow.main = img}));
        all.push(loadImage('media/debug_frame.png').then((img) => { this.pickat.debug = img}));
        all.push(fetch('/data/sounds.json').then(response => response.json()).then(json => { this.sounds = json;}));
        all.push(fetch('/sounds/main/sprite.json').then(response => response.json()).then(json => { this.sound_sprite_main = json;}));

        // Skybox textures
        /*
        let skiybox_dir = './media/skybox/park';
        all.push(loadImage(skiybox_dir + '/posx.webp').then((img) => {this.sky.posx = img}));
        all.push(loadImage(skiybox_dir + '/negx.webp').then((img) => {this.sky.negx = img}));
        all.push(loadImage(skiybox_dir + '/posy.webp').then((img) => {this.sky.posy = img}));
        all.push(loadImage(skiybox_dir + '/negy.webp').then((img) => {this.sky.negy = img}));
        all.push(loadImage(skiybox_dir + '/posz.webp').then((img) => {this.sky.posz = img}));
        all.push(loadImage(skiybox_dir + '/negz.webp').then((img) => {this.sky.negz = img}));
        */

        // Skybox shaders
        if (settings.wgsl) {
            all.push(loadTextFile('./shaders/skybox_gpu/shader.wgsl').then((txt) => { this.codeSky = { vertex: txt, fragment: txt} } ));
        } else {
            all.push(loadTextFile('./shaders/skybox/vertex.glsl').then((txt) => { this.codeSky.vertex = txt } ));
            all.push(loadTextFile('./shaders/skybox/fragment.glsl').then((txt) => { this.codeSky.fragment = txt } ));
        }

        // Shader blocks

        if (settings.wgsl) {
            // not supported 
        } else {
            all.push(
                loadTextFile('./shaders/shader.blocks.glsl')
                    .then(text => Resources.parseShaderBlocks(text, this.shaderBlocks))
                    .then(blocks => {
                        console.debug('Load shader blocks:', blocks);
                    })
            );
        }

        // Painting
        all.push[Resources.loadPainting()];

        // Physics features
        all.push(fetch('/vendors/prismarine-physics/lib/features.json').then(response => response.json()).then(json => { this.physics.features = json;}));

        // Clouds texture
        all.push(loadImage('/media/clouds.png').then((image1) => {
            let canvas          = document.createElement('canvas');
            canvas.width        = 256;
            canvas.height       = 256;
            let ctx             = canvas.getContext('2d');
            ctx.drawImage(image1, 0, 0, 256, 256, 0, 0, 256, 256);
            this.clouds.texture = ctx.getImageData(0, 0, 256, 256);
        }));

        // Mob & player models
        all.push(
            Resources.loadJsonDatabase('/media/models/database.json', '/media/models/')
                .then((t) => Object.assign(this.models, t.assets))
                .then((loaded) => {
                    console.debug("Loaded models:", loaded);
                })
        );

        // Loading progress calculator
        let d = 0;
        this.progress = {
            loaded:     0,
            total:      all.length,
            percent:    0
        };
        for (const p of all) {
            p.then(()=> {    
                d ++;
                this.progress.loaded = d;
                this.progress.percent = (d * 100) / all.length;
                this.onLoading({...this.progress});
            });
          }

        // TODO: add retry
        return Promise.all(all);

    }

    /**
     * Parse shader.blocks file defenition
     * @param {string} text 
     * @param {{[key: string]: string}} blocks
     */
    static async parseShaderBlocks(text, blocks = {}) {
        const blocksStart = '#ifdef';
        const blocksEnd = '#endif';

        let start = text.indexOf(blocksStart);
        let end = start;

        while(start > -1) {
            end = text.indexOf(blocksEnd, start);

            if (end === -1) {
                throw new TypeError('Shader block has unclosed ifdef statement at:' + start + '\n\n' + text);
            }

            const block = text.substring(start  + blocksStart.length, end);
            const lines = block.split('\n');
            const name = lines.shift().trim();

            const source = lines.map((e) => {
                return e.startsWith('    ') // remove first tab (4 space)
                    ? e.substring(4).trimEnd() 
                    : e.trimEnd();
            }).join('\n');

            blocks[name] = source.trim();

            start = text.indexOf(blocksStart, start + blocksStart.length);
        }

        return blocks;
    }

    //
    static async loadWebGLShaders(vertex, fragment) {
        let all = [];
        let resp = {
            code: {
                vertex: null,
                fragment: null
            }
        };
        all.push(Resources.loadTextFile(vertex).then((txt) => { resp.code.vertex = txt } ));
        all.push(Resources.loadTextFile(fragment).then((txt) => { resp.code.fragment = txt } ));
        await Promise.all(all);
        return resp;
    }

    //
    static async loadWebGPUShader(shader_uri) {
        let all = [];
        let resp = {
            code: {
                vertex: null,
                fragment: null
            }
        };
        all.push(Resources.loadTextFile(shader_uri).then((txt) => { resp.code.vertex = txt; resp.code.fragment = txt;}));
        await Promise.all(all);
        return resp;
    }

    static loadTextFile(url, json = false) {
        return fetch(url).then(response => json ? response.json() : response.text());
    }
    
    static loadImage(url,  imageBitmap) {
        if (imageBitmap) {
            return fetch(url)
                .then(r => r.blob())
                .then(blob => self.createImageBitmap(blob, {premultiplyAlpha: 'none'}))
                .catch((e) => {
                    vt.error('Error loadImage in resources');
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                });
        }
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = function () {
                resolve(image);
            };
            image.onError = function () {
                reject();
            };
            image.src = url;
        })
    }

    static unrollGltf(primitive, gltf, target = []) {
        const data = target;
        const {
            NORMAL, POSITION, TEXCOORD_0
        } = primitive.attributes;
        const posData = new Float32Array(POSITION.bufferView.data);
        const normData = new Float32Array(NORMAL.bufferView.data);
        const uvData = new Float32Array(TEXCOORD_0.bufferView.data);
        if (typeof primitive.indices === 'number') {
                const indices = gltf.accessors[primitive.indices];
                const i16 = new Uint16Array(indices.bufferView.data, primitive.indicesOffset, primitive.indicesLength);
                for(let i = 0; i < i16.length; i ++) {
                    let index = i16[i];
                    data.push(
                        posData[index * POSITION.size + 0],
                        posData[index * POSITION.size + 1],
                        posData[index * POSITION.size + 2],
                        uvData[index * TEXCOORD_0.size + 0],
                        uvData[index * TEXCOORD_0.size + 1],
                        0, 0, 0, 0,
                        normData[index * NORMAL.size + 0],
                        normData[index * NORMAL.size + 1],
                        normData[index * NORMAL.size + 2],
                    )
                }
        }
        return data;
    }

    static async loadJsonModel(dataModel, key, baseUrl) {
        const asset = await Resources.loadTextFile(baseUrl + dataModel.geom, true);
    
        asset.type = dataModel.type;
        asset.source = dataModel;
        asset.key = key;
        asset.skins = Object.fromEntries(Object.entries(dataModel.skins).map((e) => [e[0], null]));

        asset.getSkin = async (id) => {
            if (!dataModel.skins[id]) {
                return null;
            }

            if (asset.skins[id]) {
                return asset.skins[id];
            }

            const image = Resources
                .loadImage(baseUrl + dataModel.skins[id], !!self.createImageBitmap)

            return asset.skins[id] = image;
        }
    
        return asset;
    }

    static async loadJsonDatabase(url, baseUrl) {
        const base = await Resources.loadTextFile(url, true);
        base.baseUrl = baseUrl;

        for(let key in base.assets) {
            base.assets[key].baseUrl = baseUrl;
        }
        return base;
    }

    // loadResourcePacks...
    static async loadResourcePacks(settings) {
        const resource_packs_url = (settings && settings.resource_packs_url) ? settings.resource_packs_url : '../data/resource_packs.json';
        return Helpers.fetchJSON(resource_packs_url, true, 'rp');
    }

    // Load supported block styles
    static async loadBlockStyles(settings) {
        let resp = new Set();
        let all = [];
        let json_url = (settings && settings.json_url) ? settings.json_url : '../data/block_style.json';
        
        await Helpers.fetchJSON(json_url, true, 'bs').then((json) => {
            for(let code of json) {
                // Load module
                /*
                all.push(import('./block_style/' + code + '.js').then(module => {
                    resp.add(module.default);
                }));*/
               
                switch (code) {
                    case 'azalea':
                        all.push( import('./block_style/azalea.js').then(module => {
                            resp.add(module.default);
                        }));
                        break;   
                    case 'bamboo':
                        all.push( import('./block_style/bamboo.js').then(module => {
                            resp.add(module.default);
                        }));
                        break;  
                    case 'bed':
                        all.push(import('./block_style/bed.js').then(module => {
                            resp.add(module.default);
                        }));
                        break;   
                    case 'cake':
                        all.push(import('./block_style/cake.js').then(module => {
                            resp.add(module.default);
                        }));
                        break;
                    case 'campfire':
                        all.push(import('./block_style/campfire.js').then(module => {
                            resp.add(module.default);
                        }));
                        break;   
                    case 'cocoa':
                        all.push(import('./block_style/cocoa.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'cube':
                        all.push(import('./block_style/cube.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'door':
                        all.push(import('./block_style/door.js').then(module => {resp.add(module.default);}));
                        break; 
                    case 'extruder':
                        all.push(import('./block_style/extruder.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'fence':
                        all.push(import('./block_style/fence.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'ladder':
                        all.push(import('./block_style/ladder.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'lantern':
                        all.push(import('./block_style/lantern.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'painting':
                        all.push(import('./block_style/painting.js').then(module => {resp.add(module.default);}));
                        break;  
                    case 'pane':
                        all.push(import('./block_style/pane.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'plane':
                        all.push(import('./block_style/plane.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'planting':
                        all.push(import('./block_style/planting.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'pot':
                        all.push(import('./block_style/pot.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'redstone':
                        all.push( import('./block_style/redstone.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'sign':
                        all.push(import('./block_style/sign.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'stairs':
                        all.push(import('./block_style/stairs.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'text':
                        all.push(import('./block_style/text.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'thin':
                        all.push(import('./block_style/thin.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'torch':
                        all.push(import('./block_style/torch.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'trapdoor':
                        all.push(import('./block_style/trapdoor.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'triangle':
                        all.push(import('./block_style/triangle.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'wall':
                        all.push(import('./block_style/wall.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'item_frame':
                        all.push(import('./block_style/item_frame.js').then(module => {resp.add(module.default);}));
                        break;
                    case 'default':
                        all.push(import('./block_style/default.js').then(module => {resp.add(module.default);}));
                        break;
                        /*
                    default:
                        all.push(import('./block_style/' + code + '.js').then(module => {
                            resp.add(module.default);
                        }));
                        break;*/
                
            }
        }
        });
        await Promise.all(all).then(() => { return this; });
        return resp;
    }

  
    // Load skins
    static async loadSkins() {
        const resp = [];
        await Helpers.fetchJSON('../media/models/database.json').then(json => {
            for(let k in json.assets) {
                if(k.indexOf('player:') === 0) {
                    for(let skin_id in json.assets[k].skins) {
                        resp.push({
                            id: skin_id,
                            file: './media/models/player_skins/' + skin_id + '.png',
                            preview: './media/models/player_skins/preview/' + skin_id + '.png'
                        });
                    }
                }
            }
        });
        resp.sort((a, b) => a.id - b.id);
        return resp;
    }

    // Load recipes
    static async loadRecipes() {
        return  Helpers.fetchJSON('../data/recipes.json', true);
    }

    // Load models
    static async loadModels() {
        return  Helpers.fetchJSON('../media/models/database.json');
    }

    // Load materials
    static async loadMaterials() {
        return  Helpers.fetchJSON('../data/materials.json', true);
    }

    // Load painting
    static async loadPainting() {
        if(Resources._painting) {
            return Resources._painting;
        }
        let resp = null;
        await Helpers.fetchJSON('../data/painting.json').then(json => {
            json.sizes = new Map();
            for(const [k, item] of Object.entries(json.frames)) {
                let sz_w = item.w / json.one_width;
                let sz_h = item.h / json.one_height;
                item.x /= json.sprite_width;
                item.y /= json.sprite_height;
                item.w /= json.sprite_width;
                item.h /= json.sprite_height;
                const key = `${sz_w}x${sz_h}`;
                if(!json.sizes.has(key)) {
                    json.sizes.set(key, new Map());
                }
                json.sizes.get(key).set(k, item);
            }
            resp = json;
        });
        return Resources._painting = resp;
    }

    // Load music discs
    static async loadMusicDiscs() {
        if(Resources._music_discs) {
            return Resources._music_discs;
        }
        let resp = null;
        await Helpers.fetchJSON('../data/music_disc.json').then(json => {
            resp = json;
        });
        return Resources._music_discs = resp;
    }

}