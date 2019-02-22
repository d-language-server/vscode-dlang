# D support for Visual Studio Code

[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/v/LaurentTreguier.vscode-dls.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=LaurentTreguier.vscode-dls)

A Visual Studio Code extension for [Dlang](https://dlang.org).
Provides syntax highlighting, dub build integration with [VSCode tasks](https://code.visualstudio.com/Docs/editor/tasks) and editing features using the [Language Server protocol](https://microsoft.github.io/language-server-protocol).

## Features

[DLS](https://github.com/d-language-server/dls) is used as a Language Server, which in turn uses libraries such as [DCD](http://dcd.dub.pm), [DFMT](http://dfmt.dub.pm), [D-Scanner](http://dscanner.dub.pm) as well as [other libraries](https://github.com/d-language-server/dls/blob/master/README.md) to provide language editing features.

Look [here](https://github.com/d-language-server/dls) for an up-to-date list of features currently supported.
Not every possible feature is implemented, but the server will update itself as new features come.

## Requirements

Dub and a D compiler (DMD, LDC or GDC) should be installed for the extension to work properly.
