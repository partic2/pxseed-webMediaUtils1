
import {easyCallRemoteJsonFunction} from 'partic2/pxprpcClient/pxseedremotefuncs'
import { WebWorker1Rpc } from 'partic2/pxprpcClient/registry';
import { assert, requirejs, sleep, Task } from 'partic2/jsutils1/base';

import {importJsQR} from './jslib'

let __name__=requirejs.getLocalRequireModule(require);

export class ImageReader{
    protected _mediaStream?:MediaStream;
    protected _video?:HTMLVideoElement;
    async open(stream:MediaStream){
        this._mediaStream=stream;
        return this;
    }
    async readImage(){
        if(this._mediaStream!=undefined){
            let canvas=document.createElement('canvas');
            if(this._video==undefined){
                this._video=document.createElement('video');
                this._video.srcObject=this._mediaStream!;
                this._video.play();
            }
            if(this._video.readyState<HTMLMediaElement.HAVE_METADATA){
                await new Promise(resolve=>this._video!.addEventListener('loadedmetadata',resolve));
            }
            canvas.width=this._video!.videoWidth;
            canvas.height=this._video!.videoHeight;
            let cvs2d=canvas.getContext('2d')!;
            cvs2d.drawImage(this._video!,0,0);
            let imageData=cvs2d.getImageData(0,0,canvas.width,canvas.height);
            return imageData;
        }
    }
    async close(){
        if(this._video!=undefined){
            this._video.pause();
            this._video.srcObject=null;
            this._video=undefined;
            this._mediaStream=undefined;
        }
    }
}




export async function __parseQrFromImageDataWorker(imageData:{data:Uint8Array,width:number,height:number}){
    let jsqr=await importJsQR();
    return jsqr(new Uint8ClampedArray(imageData.data.buffer,imageData.data.byteOffset,imageData.data.byteLength),imageData.width,imageData.height,{inversionAttempts:'dontInvert'});
}
export async function parseQrFromImageData(imageData:{data:Uint8ClampedArray,width:number,height:number}){
    return easyCallRemoteJsonFunction(WebWorker1Rpc,__name__,'__parseQrFromImageDataWorker',[
        {
            data:new Uint8Array(imageData.data.buffer,imageData.data.byteOffset,imageData.data.byteLength),
            width:imageData.width,height:imageData.height
        }]) as ReturnType<typeof __parseQrFromImageDataWorker>;
}

export function *scanQrFromVideoStream(stream:MediaStream,options?:{captureInterval?:number}){
    let imageReader=yield* Task.yieldWrap(new ImageReader().open(stream));
    while(!Task.getAbortSignal()!.aborted){
        let image=yield* Task.yieldWrap(imageReader.readImage());
        if(image!=undefined){
            let result=yield* Task.yieldWrap(parseQrFromImageData(image));
            if(result!=null){
                return result;
            }
        }
        yield sleep(options?.captureInterval??500);
    }
    return null;
}

export function *scanQrFromCamera(options?:{captureInterval?:number}){
    let cam=yield* Task.yieldWrap(navigator.mediaDevices.getUserMedia({video:true}));
    try{
        return yield* scanQrFromVideoStream(cam,options);
    }finally{
        cam.getTracks().forEach(track=>track.stop());
    }
}