interface Window {
    id: number;
    horizontalPosition: number;
    verticalPosition: number;
    width: number;
    height: number
}


interface CompObject {
    id: number;
    windowId: number;
    croppedFlag: boolean;
    horizontalPosition: number;
    verticalPosition: number;
    croppingHorizontalPosition?: number
    croppingVerticalPosition?: number
    croppingWidth?: number;
    croppingHeight?: number;
};

interface Color {
    y: number;
    cr: number;
    cb: number;
    a: number;
};

interface PaletteEntry {
    id: number;
    color: Color;
};

interface PCS {
    width: number;
    height: number;
    framerate: number;
    compNumber: number;
    compState: "normal" | "acquisitionPoint" | "epochStart";
    paletteUpdateFlag: boolean;
    paletteId: number;
    objects: CompObject[];
};

interface WDS {
    windows: Window[];
};

interface PDS {
    id: number;
    version: number;
    entries: PaletteEntry[];
};

interface ODS {
    id: number;
    version: number;
    lastInSequenceFlag: "last" | "first" | "firstAndLast";
    width: number;
    height: number;
    data?: ArrayBuffer;
};

interface Packet {
    pts: number;
    dts: number;
    type: "PCS" | "WDS" | "PDS" | "ODS" | "END";
    segment?: PCS | WDS | PDS | ODS;
};


export default class SupParser {
    dataView: DataView | null = null;
    offset: number = 0;

    constructor(buffer: ArrayBufferLike) {
        this.dataView = new DataView(buffer);
        if (this.dataView.byteLength < 13 || this.dataView.getUint16(0) !== 0x5047) {
            throw new Error("empty file or not a .sup file");
        }
    }

    getNext(): Packet | null {
        if (!this.dataView || this.offset >= this.dataView.byteLength) {
            return null;
        }
        const magic = this.dataView?.getUint16(this.offset);
        this.offset += 2;
        if (magic !== 0x5047) {
            throw new Error("invalid magic");
        }
        const pts = this.dataView?.getInt32(this.offset);
        this.offset += 4;
        const dts = this.dataView?.getInt32(this.offset);
        this.offset += 4;
        const type = this.dataView?.getUint8(this.offset++);
        const size = this.dataView?.getInt16(this.offset);
        this.offset += 2;

        let packet: Packet = {
            pts: pts,
            dts: dts,
            type: "END"
        };

        switch (type) {
            case 0x14:
                packet.type = "PDS";
                packet.segment = this.getPDS(size);
                break;
            case 0x15:
                packet.type = "ODS";
                packet.segment = this.getODS(size);
                break;
            case 0x16:
                packet.type = "PCS";
                packet.segment = this.getPCS(size);
                break;
            case 0x17:
                packet.type = "WDS";
                packet.segment = this.getWDS(size);
                break;
        }

        return packet;
    }

    private getPCS(size: number): PCS | undefined {
        if (!this.dataView) {
            return undefined;
        }
        const width = this.dataView.getUint16(this.offset);
        this.offset += 2;
        const height = this.dataView.getUint16(this.offset);
        this.offset += 2;
        const frameRate = this.dataView.getUint8(this.offset++);
        const compNumber = this.dataView.getUint16(this.offset);
        this.offset += 2;
        const compState = this.dataView.getUint8(this.offset++);
        const paletteUpdateFlag = this.dataView.getUint8(this.offset++);
        const paletteId = this.dataView.getUint8(this.offset++);
        const numCompObjects = this.dataView.getUint8(this.offset++);
        const objects: CompObject[] = [];

        for (let i = 0; i < numCompObjects; i++) {
            const objectId = this.dataView.getUint16(this.offset);
            this.offset += 2;
            const windowId = this.dataView.getUint8(this.offset++);
            const croppedFlag = this.dataView.getUint8(this.offset++) === 0x40;
            const horizontalPosition = this.dataView.getUint16(this.offset);
            this.offset += 2;
            const verticalPosition = this.dataView.getUint16(this.offset);
            this.offset += 2;

            let object: CompObject = {
                id: objectId,
                windowId: windowId,
                croppedFlag: croppedFlag,
                horizontalPosition: horizontalPosition,
                verticalPosition: verticalPosition
            };

            if (croppedFlag) {
                object.croppingHorizontalPosition = this.dataView.getUint16(this.offset);
                this.offset += 2;
                object.croppingVerticalPosition = this.dataView.getUint16(this.offset);
                this.offset += 2;
                object.croppingWidth = this.dataView.getUint16(this.offset);
                this.offset += 2;
                object.croppingHeight = this.dataView.getUint16(this.offset);
                this.offset += 2;
            }

            objects.push(object);
        }

        return {
            width: width,
            height: height,
            framerate: frameRate,
            compNumber: compNumber,
            compState: (compState === 0x00 ? "normal" : compState === 0x40 ? "acquisitionPoint" : "epochStart"),
            paletteUpdateFlag: paletteUpdateFlag === 0x80,
            paletteId: paletteId,
            objects: objects
        };
    }

    private getWDS(size: number): WDS | undefined {
        if (!this.dataView) {
            return undefined;
        }
        const windows: Window[] = [];
        const numWindows = this.dataView.getUint8(this.offset++);
        for (let i = 0; i < numWindows; i++) {
            const windowId = this.dataView.getUint8(this.offset++);
            const horizontalPosition = this.dataView.getUint16(this.offset);
            this.offset += 2;
            const verticalPosition = this.dataView.getUint16(this.offset);
            this.offset += 2;
            const width = this.dataView.getUint16(this.offset);
            this.offset += 2;
            const height = this.dataView.getUint16(this.offset);
            this.offset += 2;
            windows.push({
                id: windowId,
                horizontalPosition: horizontalPosition,
                verticalPosition: verticalPosition,
                width: width,
                height: height
            });
        }
        return {
            windows: windows
        };
    }

    private getPDS(size: number): PDS | undefined {
        if (!this.dataView) {
            return undefined;
        }
        const id = this.dataView.getUint8(this.offset++);
        const version = this.dataView.getUint8(this.offset++);
        const entries: PaletteEntry[] = [];

        const numEntries = (size - 2) / 5;
        for (let i = 0; i < numEntries; i++) {
            const entryId = this.dataView.getUint8(this.offset++);
            const y = this.dataView.getUint8(this.offset++);
            const cr = this.dataView.getUint8(this.offset++);
            const cb = this.dataView.getUint8(this.offset++);
            const a = this.dataView.getUint8(this.offset++);
            entries.push({
                id: entryId,
                color: { y, cr, cb, a }
            });
        }

        return {
            id,
            version,
            entries
        };
    }

    private getODS(size: number): ODS | undefined {
        if (!this.dataView) {
            return undefined;
        }
        const id = this.dataView.getUint16(this.offset);
        this.offset += 2;
        const version = this.dataView.getUint8(this.offset++);
        const lastInSequenceFlagValue = this.dataView.getUint8(this.offset++);
        const lastInSequenceFlag = lastInSequenceFlagValue === 0x40 ? "last" :
            lastInSequenceFlagValue === 0x80 ? "first" :
                "firstAndLast";
        const objectDataLength = ((this.dataView.getUint8(this.offset++) << 16) |
            (this.dataView.getUint8(this.offset++) << 8) |
            this.dataView.getUint8(this.offset++)) - 4;

        let ods: ODS = {
            id,
            version,
            lastInSequenceFlag,
            width: 0,
            height: 0
        }

        if (objectDataLength > 0) {
            ods.width = this.dataView.getUint16(this.offset);
            this.offset += 2;
            ods.height = this.dataView.getUint16(this.offset);
            this.offset += 2;
            ods.data = this.dataView.buffer.slice(this.offset, this.offset + objectDataLength);
            this.offset += objectDataLength;
        }

        return ods;
    }
};
