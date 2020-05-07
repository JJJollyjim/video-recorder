const config = {
	google_auth2_options: {
		client_id: "1084993402039-2hhq5nj0igkog2bgdlcioq3h6nvt7r73.apps.googleusercontent.com",
		scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install profile",
	},
	chunk_size: 5 * 1024 * 1024
};

declare const MediaRecorder: any;
declare const gapi: any;
declare const kwiius_reportError: any;

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

interface String {
	repeat(count: number): string;
}

interface GlobalState {
	media?: MediaStream;
	filename?: string;
	uploadState: UploadState;
}

interface UploadState {
	started: boolean;
	url?: string;
	currentRequest: Promise<any> | undefined;
	networkBusy: boolean;
	bytesAcked: number;
	chunks: Blob[];
	mimeType?: string;
	chunks_size: number;
};

const state: GlobalState = {
	uploadState: {
		started: false,
		url: undefined,
		currentRequest: undefined,
		networkBusy: false,
		bytesAcked: 0,
		mimeType: undefined,
		chunks: [],
		chunks_size: 0,
	}
};

interface String {
	repeat(count: number): string;
}

if (typeof MediaRecorder === "undefined") {
	alert("Your browser is not able to record video. Please use Chrome or Firefox on a computer, or the Camera app on your phone.");
}

function bp() {
	debugger;
}

function camelToKebab(camel: string): string {
	return camel.replace(/\.?([A-Z])/g, (match, up) => "-" + up.toLowerCase());
}

function leftPad (str: string, n: number, chr: string) {
	return chr.repeat(n - str.length) + str;
}

enum Step {
	signIn,
	givePermissions,
	giveName,
	testInput,
	record,
	finaliseUpload,
	success
}

let stepElems: HTMLDivElement[] = Object.keys(Step)
	.map(k => Step[k as any])
	.filter(k => typeof k === "string")
	.map((name) => $(`.steps>#step-${camelToKebab(name)}`));

let showStep = (() => {
	let currentStep: Step | undefined;

	return function showStep(step: Step) {
		if (currentStep !== undefined) {
			stepElems[currentStep].style.display = "none";
		}

		stepElems[step].style.display = "block";

		currentStep = step;
	};
})();



function promiseTimeout(n: number): PromiseLike<any> {
	return new Promise(function(resolve, reject) {
		setTimeout(resolve, n);
	});
}


interface CreationState {
	action: string;
	folderId?: string;
	userId: string;
};


const urlParams = new URLSearchParams(location.search);
let creationState: CreationState | undefined = undefined;
if (urlParams.has("state")) {
	creationState = JSON.parse(urlParams.get("state")!);

	if (creationState!.folderId != null) {
		for (let elem of $$(".only-if-folder-not-specified")) {
			elem.style.display = "none";
		}
	}
} else {
	for (let elem of $$(".only-if-folder-not-specified")) {
		elem.style.display = "inline";
	}
}

const saveData = (function () {
	const a = document.createElement("a");
	document.body.appendChild(a);
	a.style.display = "none";
	return function (data: Blob, fileName: string) {
		const blob = new Blob([data], {type: "octet/stream"});
		const url = URL.createObjectURL(blob);
		a.href = url;
		a.download = fileName;
		a.click();
		// URL.revokeObjectURL(url);
	};
}());

const accessToken = () => gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;

function statusText(text: string) {
	$(".statustext").textContent = text;
}

function setupPreview(media: MediaStream, elem: HTMLVideoElement): () => void {
	// liveview.onerror = (e) => console.error(e);

	elem.srcObject = media;
	elem.play();

	return function cancelPreview() {
		elem.pause();
		URL.revokeObjectURL(elem.src);
	};
}

function setupVU(media: MediaStream, elem: HTMLElement) {
	const ctx = new AudioContext();

	const sourceNode = ctx.createMediaStreamSource(media);
	const analyserNode = ctx.createAnalyser();
	const array =  new Uint8Array(analyserNode.frequencyBinCount);

	let cancelled = false;

	analyserNode.smoothingTimeConstant = .8;
	analyserNode.fftSize = 32;

	sourceNode.connect(analyserNode);

	function draw() {
		analyserNode.getByteFrequencyData(array);

		let percentage = 100 * Math.min(array.reduce((a, b) => a + b, 0), 4096) / 4096;
		elem.style.width = percentage + "%";

		if (!cancelled )requestAnimationFrame(draw);
	}

	requestAnimationFrame(draw);

	return function cancelVU() {
		cancelled = true;
	};
}

function setupProgress(state: UploadState, elem: HTMLDivElement) {
	let cancelled = false;

	function draw() {
		requestAnimationFrame(draw);

		if (state.chunks_size > 0) {
			elem.style.width = `${100 * state.bytesAcked / state.chunks_size}%`;
		}
	}

	draw();
}

function setupRecordingTimer(startTime: Date, elem: HTMLElement) {
	function draw() {
		let deltaSeconds = Math.floor((new Date().valueOf() - startTime.valueOf()) / 1000);

		elem.textContent = `${Math.floor(deltaSeconds / 60)}:${leftPad((deltaSeconds % 60).toString(),2,"0")}`;
		requestAnimationFrame(draw);
	}
	requestAnimationFrame(draw);
}

function allowNameSubmitIfNameOkay() {
	if ($("#name-input").value.length === 0) {
		$("#name-submit").setAttribute("disabled", "disabled");
	} else {
		$("#name-submit").removeAttribute("disabled");
	}
}

$("#name-input").addEventListener("input", allowNameSubmitIfNameOkay);
allowNameSubmitIfNameOkay(); // In case the browser keeps the name accross refreshes etc.

function makeExponentialBackoff(initialTime: number) {
	let time = initialTime;

	return {
		reset: (<T>(sucVal: T): T => {time = initialTime; return sucVal; }),
		backoff: (fn: <T>() => PromiseLike<T>) => (e: any) => {
			time *= 2;
			console.warn("Retrying after", time, "ms due to network failure:", e);
			return promiseTimeout(time).then(fn);
		}
	};
}

let exponentialBackoff = makeExponentialBackoff(50);

function loadGoogleAuthLib() {
	return new Promise((resolve, reject) => {
		gapi.load("auth2", resolve);
	});
}

function initGoogleAuthLib(options: {}) {
	return new Promise((res, rej) => {
		gapi.auth2.init(options).then(
			() => res(),
			(e: any) => rej(e)
		);
	});
}

function waitForSignIn() {
	return new Promise((resolve, reject) => {
		const iss = gapi.auth2.getAuthInstance().isSignedIn;

		function statusChangeCallback(status: boolean) {
			if (status) resolve();
		}

		iss.listen(statusChangeCallback);
		statusChangeCallback(iss.get());
	});
}

function waitForFormSubmit(elem: HTMLElement) {
	return new Promise((resolve, reject) => {
		elem.addEventListener("submit", (ev: Event) => {resolve(); ev.preventDefault(); });
	});
}

function getMediaPermissions() {
	return navigator.mediaDevices.getUserMedia({
		audio: true,
		// video: true
		video: {
			facingMode: "user",
			width: {max: 854},
			height: {max: 480}
		}
	});
}

function recordAndUpload(media: MediaStream) {
	const mr = new MediaRecorder(media);

	const uploadState = state.uploadState;

	function maybeUploadSomeData() {
		if ((uploadState.chunks_size - uploadState.bytesAcked) >= config.chunk_size) {
			// console.log("probably upload");
			if (uploadState.started && !uploadState.networkBusy) {
				upload(false); // If the caller is uncertain whether they want to upload, they mustn't want to finalise it.
			}
		}
	}

	function initialiseUpload(firstChunk: Blob): Promise<any> {
		console.log("Initiating upload");
		kwiius_reportError("initUpload", {});

		uploadState.networkBusy = true;
		uploadState.mimeType = firstChunk.type.split(";")[0];

		const data = {
			name: $("#name-input").value,
			mimeType: uploadState.mimeType,
			// Defying docs, google sometimes sends state without a folderId!
			parents: (creationState && creationState.folderId) ? [creationState.folderId] : []
		};

		let prom = fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
			method: "post",
			mode: "cors",
			body: JSON.stringify(data),
			headers: {
				"Content-Type": "application/json;charset=UTF-8",
				"Authorization": "Bearer " + accessToken(),
				"X-Upload-Content-Type": uploadState.mimeType
			}
		}).then((res) => {
			if (res.ok) {
				let url = res.headers.get("Location");
				uploadState.url = url ? url : undefined;
				uploadState.started = true;
				uploadState.networkBusy = false;
			} else {
				throw res;
			}
		}).then(exponentialBackoff.reset)
			.catch(exponentialBackoff.backoff(() => initialiseUpload(firstChunk)));
		uploadState.currentRequest = prom;
		return prom;
	}

	function upload(finalise: boolean): Promise<undefined> {
		kwiius_reportError("uploadChunk", {final: finalise});
		console.log("gonna upload", finalise);

		const mergedData = new Blob(uploadState.chunks, {type: uploadState.mimeType});
		uploadState.chunks.length = 0;
		uploadState.chunks.push(mergedData);

		console.log("mergedData is", mergedData.size);
		console.log("ba is", uploadState.bytesAcked);

		const toUpload = mergedData.slice(uploadState.bytesAcked, mergedData.size, mergedData.type);

		if (uploadState.bytesAcked + toUpload.size !== uploadState.chunks_size) {
			throw new Error("Assertion size bleep blorp");
		}

		uploadState.networkBusy = true;
		uploadState.currentRequest = fetch(uploadState.url!, {
			method: "post",
			mode: "cors",
			body: toUpload,
			headers: {
				"Content-Type": toUpload.type,
				"Content-Range": `bytes ${uploadState.bytesAcked}-${uploadState.chunks_size - 1}/${finalise ? uploadState.chunks_size : "*"}`
			}
		}).then((res) => {
			if (!(res.ok || res.status === 308)) {
				kwiius_reportError("uploadError", {ok: res.ok, status: res.status});
				throw res;
			}
			return res;
		}).then((res) => {
			if (res.headers.has("Range")) {
				let range = res.headers.get("Range");

				let match = range!.match(/^bytes ?= ?([0-9]+)-([0-9]+)$/i);

				uploadState.bytesAcked = parseInt(match![2], 10) + 1;

			} else {
				uploadState.bytesAcked += toUpload.size;
			}

			uploadState.networkBusy = false;
			console.log("now acked", uploadState.bytesAcked, "bytes");

		}).then(exponentialBackoff.reset)
			.catch(exponentialBackoff.backoff(() => upload(finalise)));

		return uploadState.currentRequest;
	}

	mr.ondataavailable = ((ev: any) => {
		let chunk = ev.data;

		uploadState.chunks.push(chunk);
		uploadState.chunks_size += chunk.size;

		if (!uploadState.started && !uploadState.networkBusy) {
			initialiseUpload(chunk).then(() => maybeUploadSomeData());
		} else {
			maybeUploadSomeData();
		}
	});

	let uploadFinishedPromise = new Promise((resolve, reject) => {
		mr.onstop = (() => {
			if (uploadState.networkBusy) {
				console.log("Onstop currently uploading");
				uploadState.currentRequest!.then(() => upload(true)).then(resolve, reject);
			} else {
				console.log("Onstop not uploading");
				upload(true).then(resolve, reject);
			}

			// TODO implement this
			// saveData(result, "interaction.webm");
			// location.assign(URL.createObjectURL(result));

		});
	});

	mr.onerror = ((e: any) => {
		let obj: any = {obj: e};
		if ("name" in e) {
			obj.name = e.name;
		}
		if ("message" in e) {
			obj.message = e.message;
		}
		if ("stack" in e) {
			obj.stack = e.stack;
		}
		kwiius_reportError("mediaRecorderError", obj);
		console.error(e);
	});

	mr.start();
	setInterval(() => {if (mr.state !== "inactive") { mr.requestData(); }} , 500);

	return {
		stop: () => {
			mr.stop();
			for (let track of media.getTracks()) {
				track.stop();
			}
		},
		finished: uploadFinishedPromise
	};
}


loadGoogleAuthLib()
	.then(() => initGoogleAuthLib(config.google_auth2_options))

	.then(() => {
		showStep(Step.signIn);
		$("#sign-in-submit").focus();
		return waitForSignIn();
	})

	.then(() => {
		showStep(Step.givePermissions);
		return getMediaPermissions().then((media) => { state.media = media; } );
	})

	.then(() => {
		showStep(Step.giveName);

		$("#name-input").focus();
		return waitForFormSubmit($("#name-form"));
	})

	.then(() => {
		let cancelPrev = setupPreview(state.media!, $("#test-liveview"));
		let cancelVU = setupVU(state.media!, $("#test-meter"));
		showStep(Step.testInput);
		$("#test-submit").focus();

		return waitForFormSubmit($("#test-form")).then(() => {
			cancelPrev();
			cancelVU();
		});
	})

	.then(() => {
		let cancelPrev = setupPreview(state.media!, $("#record-liveview"));
		showStep(Step.record);
		$("#record-start-submit").focus();

		return waitForFormSubmit($("#record-start-form")).then(() => cancelPrev);
	})

	.then((cancelPrev: () => void) => {
		$("#step-record").classList.add("counting");
		let uploadFinished;

		return promiseTimeout(2500) // Go slightly early to be certain that we start before the animation finishes
			.then(() => {
				setupRecordingTimer(new Date(), $(".recording-timer"));
				let {stop, finished} = recordAndUpload(state.media!);
				$("#record-submit").removeAttribute("disabled");
				uploadFinished = finished;

				kwiius_reportError("startRecording", {});

				return waitForFormSubmit($("#record-form"))
					.then(() => {
						kwiius_reportError("finishRecording", {});
						stop();
						cancelPrev();
						showStep(Step.finaliseUpload);
						setupProgress(state.uploadState, $("#progress-meter"));

						return finished;
					});
			});
	})

	.then(() => {
		kwiius_reportError("uploadSuccess", {});
		showStep(Step.success);
	})

	.catch(
		(e) => {
			let obj: any = {obj: e};
			if ("name" in e) {
				obj.name = e.name;
			}
			if ("message" in e) {
				obj.message = e.message;
			}
			if ("stack" in e) {
				obj.stack = e.stack;
			}
			kwiius_reportError("promiseCaughtError", obj);
			console.error(e);
		}
	);
