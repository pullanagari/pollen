Quagga.init({
    inputStream: {
        type: "LiveStream",
        target: document.querySelector('#scanner'),
        constraints: {
            facingMode: "environment",
            width: 1920,
            height: 1080
        }
    },

    locator: {
        patchSize: "large",
        halfSample: false
    },

    numOfWorkers: 4,

    decoder: {
        readers: [
            "code_128_reader",
            "ean_reader"
        ]
    },

    locate: true

}, function(err) {

    if (err) {
        console.log(err);
        return;
    }

    Quagga.start();
});

Quagga.onDetected((result) => {

    const code = result.codeResult.code;

    console.log("Detected:", code);

});
