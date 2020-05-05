{ pkgs, stdenv, ... }:
stdenv.mkDerivation rec {
  name = "video-recorder";

  buildInputs = [ pkgs.nodePackages.typescript ];

  src = pkgs.nix-gitignore.gitignoreSource [] ./.;

  buildPhase = ''
    tsc
  '';

  installPhase = ''
    mkdir -p $out
    cp index.html $out/
    cp style.css $out/
    cp main.js $out/main-recache.js
    cp bootstrap.min.css $out/
  '';
}
