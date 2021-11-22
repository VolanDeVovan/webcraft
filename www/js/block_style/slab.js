import {DIRECTION, MULTIPLY, TX_CNT} from '../helpers.js';
import { default as push_plane_style } from './plane.js';

const push_plane = push_plane_style.getRegInfo().func;

// Плита
export default class style {

    static getRegInfo() {
        return {
            styles: ['slab'],
            func: this.func
        };
    }

    static func(block, vertices, chunk, x, y, z) {

        const half = 0.5 / TX_CNT;

        let texture = block.material.texture;
        block.transparent = true;

        let on_ceil = block.extra_data && block.extra_data.point.y >= .5; // на верхней части блока (перевернутая ступенька)

        let yt = y;
        if(on_ceil) {
            yt += .5;
        }

        // полная текстура
        let c = BLOCK.calcTexture(texture, DIRECTION.UP);

        // нижняя половина текстуры
        let c_half_bottom= [
            c[0],
            c[1] + half /2,
            c[2],
            c[3] - half,
        ];

        // South
        let lm = MULTIPLY.COLOR.WHITE;
        push_plane(vertices, x, yt, z - .5, c_half_bottom, lm, true, false, null, .5, null);

        // North
        lm = MULTIPLY.COLOR.WHITE;
        push_plane(vertices, x, yt, z + .5, c_half_bottom, lm, true, false, null, .5, null);

        // East
        lm = MULTIPLY.COLOR.WHITE;
        push_plane(vertices, x + 0.5, yt, z, c_half_bottom, lm, false, false, null, .5, null);

        // West
        lm = MULTIPLY.COLOR.WHITE;
        push_plane(vertices, x - 0.5, yt, z, c_half_bottom, lm, false, false, null, .5, null);

        // Up and down
        c = BLOCK.calcTexture(texture, DIRECTION.DOWN);
        lm = MULTIPLY.COLOR.WHITE;
        let flags = 0, sideFlags = 0, upFlags = 0;

        // Up
        vertices.push(x + 0.5, z + 0.5, yt + .5,
            1, 0, 0,
            0, 1, 0,
            ...c,
            lm.r, lm.g, lm.b, flags | upFlags);

        // Down
        vertices.push(x + 0.5, z + 0.5, yt,
            1, 0, 0,
            0, -1, 0,
            ...c,
            lm.r, lm.g, lm.b, flags);

    }

}