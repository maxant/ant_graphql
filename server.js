var express = require('express');
var graphqlHTTP = require('express-graphql');
var { buildSchema } = require('graphql');

// Construct a schema, using GraphQL schema language
//
// ant says: could we generate this somehow? 
//  - do we really have to define every attribute?
var schema = buildSchema(`
  # #############################
  # a test interface:

  type Query {
    hello: String,

    # a function to roll dice, returning an array of values
    rollDice(numDice: Int): [Int]

    getSchadenfall(id: Int!): Schadenfall # ! means not null

    moreDetailedExample(in: String): String
  }

  # #############################
  # a mutation allows for updates
  type Mutation {
    updateSchadenfall(sf: SchadenfallInput!): Schadenfall
  }

  # #############################
  # types:

  # TODO
  # - would be great if we could generate this, say out of swagger!
  # - do i really have to define all types and then also all classes? that sux...
  #attempt to use interfaces, so inputs can implement them and inherit all fields... sadly doesnt work, see below :-(
  type Schadenfall {
    id: Int
    someAttr: String
    someAttr2: Int
    grossereignis: Grossereignis
    teilfaelle: [Teilfall]
  }

  type Teilfall {
    someAttr: String
  }

  type Grossereignis {
    datum: String
  }


  # https://github.com/mugli/learning-graphql/blob/master/7.%20Deep%20Dive%20into%20GraphQL%20Type%20System.md
  # The Object type has not been used here intentionally, because Objects can contain fields that express circular
  #  references or references to interfaces and unions, neither of which is appropriate for use as an input argument. 
  # For this reason, input objects have a separate type in the system.
  input SchadenfallInput { 
#DOESNT WORK: implements ISchadenfall...
    #... so we HAVE to duplicate this definition :-(
    id: Int
    someAttr: String
    someAttr2: Int
    grossereignis: GrossereignisInput
    teilfaelle: [TeilfallInput]
  }

  input TeilfallInput {
    someAttr: String
  }

  input GrossereignisInput {
    datum: String
  }
`);

// The root provides a resolver function for each API endpoint
var root = { 
    hello: () => { 
        console.log('boo!');
        return 'Hello world!';
    } ,
    rollDice: ({numDice}) => {
        const out = [];
        for(i = 0; i < numDice; i++){
            out[i] = Math.floor(Math.random() * (6)) + 1;
        }
        return out;
    },

    // ///////////////////////////////
    // Schadenfall Interface:

    getSchadenfall: ({id}) => {
        //TODO replace this block with a service
        const sf = new Schadenfall();
        sf.id = id;
        sf.someAttr = 'someAttribute';
        sf.someAttr2 = 99;
        sf.teilfaelle.push(new Teilfall());
        sf.teilfaelle[0].someAttr = 'aTfAttr';
        sf.grossereignis.datum = '2017-10-08T17:21:00.000'
        return sf;
    },

    updateSchadenfall: ({sf}) => {
        //TODO update via backend. read via backend
        sf.someAttr = '' + Date.now();
        return sf;
    },

    moreDetailedExample: (obj, args, context) => {
        //args.in is the way to access the "in" parameter
        return "obj:" + JSON.stringify(obj) + "::args:" + args.in + "::context:" + JSON.stringify(context);
    }
};

class Schadenfall {
    constructor(){
        this.teilfaelle = [];
        this.grossereignis = new Grossereignis();
    }
}
class Teilfall {
}
class Grossereignis {
}

var app = express();
app.use('/graphql', graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: true,
}));
app.listen(4000, () => console.log('Now browse to localhost:4000/graphql'));

//whats the actual advantage of graphql? is it that i can tell graphql exactly what i want? do i have to tell it about EVERY attr or
//could i just tell it i want ALL of the teilfall?
// YES. e.g. this query:
//    query {
//      getSchadenfall(id: 4) {
//        id, someAttr, teilfaelle
//      }
//    }
//
// results in:
//    {
//      "data": {
//        "getSchadenfall": {
//          "id": 4,
//          "someAttr": "someAttribute",
//          "teilfaelle": [
//            {
//              "someAttr": "aTfAttr"
//            }
//          ]
//        }
//      }
//    }
//
// ie. you get what you ask for, but you can just ask for an entire object too, e.g. teilfaelle

//the following query only returns the ID of the schadenfall, no other fields. strange...
//Request:
//    query {
//      getSchadenfall(id: 4)
//    }
//
//Response:
//    {
//      "data": {
//        "getSchadenfall": {
//          "id": 4
//        }
//      }
//    }
//
//TODO so how do i tell it to give me absolutely everything? it would suck if i had to really define all attributes :-(
//
//TODO none of this really solves my problem with ZPBs. partly because they are too dynamic and graphql 
//probably? cannot do lookups from definitionen to daten...?
//
//huh? http://graphql.org/graphql-js/mutations-and-input-types/ => it says:
//     "Input types can't have fields that are other objects, only basic scalar types, list types, and other input types."
//  how can i then define a schadenfall which is used as an input AND an output?
// OK it turns out i can use objects in the input. but i have do define then doubly. see above with the input parameters as well as why.
// Request:
//    mutation {
//      updateSchadenfall(sf: {
//        id:4,
//        teilfaelle:[{
//          someAttr:"asdf"
//        }]
//      }) {
//        id, someAttr, teilfaelle {
//          someAttr
//        }
//      }
//    }
//
// Response:
//    {
//      "data": {
//        "updateSchadenfall": {
//          "id": 4,
//          "someAttr": "1507477453760",
//          "teilfaelle": [
//            {
//              "someAttr": "asdf"
//            }
//          ]
//        }
//      }
//    }
//
// Error messages are a little shit since they don't show the position of the problem in the schema:
//
//   Error: Schadenfall fields must be an object with field names as keys or a function which returns such an object.
//     at invariant (/w/tullia/graphql/node_modules/graphql/jsutils/invariant.js:18:11)
//     at defineFieldMap (/w/tullia/graphql/node_modules/graphql/type/definition.js:353:54)
//     at GraphQLObjectType.getFields (/w/tullia/graphql/node_modules/graphql/type/definition.js:310:44)
//     at typeMapReducer (/w/tullia/graphql/node_modules/graphql/type/schema.js:208:25)
//     at /w/tullia/graphql/node_modules/graphql/type/schema.js:218:20
//     at Array.forEach (native)
//     at typeMapReducer (/w/tullia/graphql/node_modules/graphql/type/schema.js:209:27)
//     at Array.reduce (native)
//     at new GraphQLSchema (/w/tullia/graphql/node_modules/graphql/type/schema.js:97:34)
//     at buildASTSchema (/w/tullia/graphql/node_modules/graphql/utilities/buildASTSchema.js:211:10)

/*
Query like this:
{
  rollDice(numDice:4)
}

Request:
var dice = 3;
var xhr = new XMLHttpRequest();
xhr.responseType = 'json';
xhr.open("POST", "/graphql");
xhr.setRequestHeader("Content-Type", "application/json");
xhr.setRequestHeader("Accept", "application/json");
xhr.onload = function () {
  console.log('data returned:', xhr.response);
}
var query = `query RollDice($dice: Int) {
  rollDice(numDice: $dice) //use variables so you don't have to escape anything or build complex strings
}`;
xhr.send(JSON.stringify({
  query: query,
  variables: { dice: dice },
}));

Response: 
{
  "data": {
    "rollDice": [
      2,
      6,
      2,
      4
    ]
  }
}

*/

