
import {easyCallRemoteJsonFunction} from 'partic2/pxprpcClient/pxseedremotefuncs'
import { WebWorker1Rpc } from 'partic2/pxprpcClient/registry';
import { assert, future, requirejs, sleep, Task } from 'partic2/jsutils1/base';
import * as React from 'preact'
import {importJsQR, importModernScreenshot} from './jslib'
import { ReactRefEx } from 'partic2/pComponentUi/domui'
import type { WorkspaceWindowComponent } from 'partic2/pComponentUi/workspace';


let __name__=requirejs.getLocalRequireModule(require);

export class ImageReader{
    protected _mediaStream?:MediaStream;
    protected _video?:HTMLVideoElement;
    async from(source:MediaStream|HTMLVideoElement){
        if(source instanceof MediaStream){
            this._mediaStream=source;
            if(this._video==undefined){
                this._video=document.createElement('video');
                this._video.srcObject=this._mediaStream!;
                this._video.play();
            }
        }else if(source instanceof HTMLVideoElement){
            this._video=source;
        }
        return this;
    }
    async readImage(){
        if(this._video!=undefined){
            let canvas=document.createElement('canvas');
            if(this._video.readyState<HTMLMediaElement.HAVE_METADATA){
                await new Promise(resolve=>this._video!.addEventListener('loadedmetadata',resolve));
            }
            canvas.width=this._video!.videoWidth;
            canvas.height=this._video!.videoHeight;
            let cvs2d=canvas.getContext('2d')!;
            cvs2d.drawImage(this._video!,0,0);
            let imageData=cvs2d.getImageData(0,0,canvas.width,canvas.height);
            return imageData;
        }else{
            throw new Error('No available source, use "from" before read.')
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


interface Point {
    x: number;
    y: number;
}

interface QRCode {
    binaryData: number[];
    version: number;
    location: {
        topRightCorner: Point;
        topLeftCorner: Point;
        bottomRightCorner: Point;
        bottomLeftCorner: Point;
        topRightFinderPattern: Point;
        topLeftFinderPattern: Point;
        bottomLeftFinderPattern: Point;
        bottomRightAlignmentPattern?: Point;
    };
}

export async function __parseQrFromImageDataWorker(imageData:{data:Uint8Array,width:number,height:number}):Promise<QRCode>{
    let jsqr=await importJsQR();
    return jsqr(new Uint8ClampedArray(imageData.data.buffer,imageData.data.byteOffset,imageData.data.byteLength),imageData.width,imageData.height,{inversionAttempts:'dontInvert'});
}
export async function parseQrFromImageData(imageData:{data:Uint8ClampedArray,width:number,height:number}):Promise<QRCode>{
    return easyCallRemoteJsonFunction(WebWorker1Rpc,__name__,'__parseQrFromImageDataWorker',[
        {
            data:new Uint8Array(imageData.data.buffer,imageData.data.byteOffset,imageData.data.byteLength),
            width:imageData.width,height:imageData.height
        }])
}

export function *scanQrFromVideoStream(stream:MediaStream|HTMLVideoElement,options?:{captureInterval?:number}){
    let imageReader=yield* Task.yieldWrap(new ImageReader().from(stream));
    while(!Task.getAbortSignal()!.aborted){
        let image=yield* Task.yieldWrap(imageReader.readImage());
        if(image!=undefined){
            let result=yield* Task.yieldWrap(parseQrFromImageData(image));
            if(result!=null){
                return {qr:result,image};
            }
        }
        yield sleep(options?.captureInterval??500);
    }
    return null;
}


export function *scanQrFromVideoStreamContinuously(stream:MediaStream|HTMLVideoElement,onQr:(e:{qr:QRCode,image:ImageData})=>void,options?:{captureInterval?:number}){
    let imageReader=yield* Task.yieldWrap(new ImageReader().from(stream));
    while(!Task.getAbortSignal()!.aborted){
        let image=yield* Task.yieldWrap(imageReader.readImage());
        if(image!=undefined){
            let result=yield* Task.yieldWrap(parseQrFromImageData(image));
            if(result!=null){
                onQr({qr:result,image})
            }
        }
        yield sleep(options?.captureInterval??500);
    }
    return null;
}

export async function domToPngDataUrl(dom:HTMLElement): Promise<string>{
    let ms=await importModernScreenshot();
    return await ms.domToPng(dom);
}

export async function domToImageData(dom: HTMLElement): Promise<ImageData> {
    let ms=await importModernScreenshot();
    const canvas = await ms.domToCanvas(dom)
    return canvas.getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height)
}


export class CameraQrScanner extends React.Component<{onQr:(e:{qr:QRCode,image:ImageData})}>{
    videoRef=new ReactRefEx<HTMLVideoElement>();
    camStream?:MediaStream;
    scanTask?:Task<void>;
    async componentDidMount() {
        try{
            let video=await this.videoRef.waitValid();
            this.camStream=await globalThis.navigator.mediaDevices.getUserMedia({video:{facingMode: { ideal: 'environment' }}})
            video.srcObject=this.camStream;
            await video.play();
            let this2=this;
            this.scanTask=Task.fork(function *(){
                try{
                    while(true){
                        let r=yield *scanQrFromVideoStream(video);
                        if(r!=null){
                            this2.props.onQr(r);
                            break;
                        }
                    }
                }catch(err){}finally{
                    this2.camStream!.getTracks().forEach((t1)=>t1.stop());
                }
                
            }).run();
        }catch(err){}
    }
    async componentWillUnmount() {
        if(this.scanTask!=undefined)this.scanTask.abort();
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        return <video style={{width:'100%',height:'100%'}} ref={this.videoRef} />
    }
}

export async function openWindowToScanQrWithCamera(){
    let { openNewWindow }=await import('partic2/pComponentUi/workspace');
    let result=new future<{qr:QRCode}|null>();
    let wnd=await openNewWindow(<CameraQrScanner onQr={(e)=>result.setResult(e)}/>,{title:'scanning...'});
    (await wnd.windowRef.waitValid() as WorkspaceWindowComponent).setMaximized(true);
    wnd.waitClose().then(()=>result.setResult(null));
    try{
        return await result.get()
    }finally{
        wnd.close();
    }
}