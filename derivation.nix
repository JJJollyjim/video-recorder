{ pkgs, stdenv, extraJS ? "", ... }:
stdenv.mkDerivation rec {
  name = "video-recorder";

  buildInputs = [ pkgs.nodePackages.typescript ];

  src = pkgs.nix-gitignore.gitignoreSource [] ./.;

  buildPhase = ''
    tsc
  '';

  inherit extraJS;

  preInstallPhases = [ "extraJSPhase" ];
  extraJSPhase = ''
    cat $extraJS main.js > combined.js
    mv combined.js main.js
    '';

  installPhase = ''
    mkdir -p $out
    cp index.html $out/
    cp style.css $out/
    cp main.js $out/main-recache.js
    cp bootstrap.min.css $out/
  '';
}
